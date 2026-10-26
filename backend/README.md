# Prescriptor NDVI · Backend

API en Python (FastAPI) para el Prescriptor NDVI:

- **Cuentas**: solicitud → aprobación del administrador → código de activación → ingreso con sesión (JWT).
- **NDVI**: sube un ortomosaico multiespectral (GeoTIFF) o un NDVI ya calculado; se procesa en segundo plano.
- **Zonas de manejo**: de 2 a 7 zonas por cuantiles o intervalos iguales, con limpieza de islas pequeñas.
- **Prescripción para Agras**: `.zip` con la carpeta `DJI/` lista para la microSD del control remoto.
- **Historial**: lotes, vuelos y prescripciones por usuario.
- **Informe PDF**: mapas NDVI y de zonas, tabla de dosis, producto total y estadísticas.

## Estructura en el repositorio

Copia el contenido de este paquete en la raíz de `prescriptorDJI/prescriptor`:

```
prescriptor/
├── index.html                    ← tu frontend actual (no se toca)
├── .github/workflows/backend.yml ← tests + publicación en ghcr.io
└── backend/
    ├── app/                      ← código de la API
    ├── tests/                    ← pruebas automáticas
    ├── Dockerfile
    ├── docker-compose.yml
    ├── requirements.txt
    └── .env.example
```

## Probar en tu computador

Con Docker (recomendado):

```bash
cd backend
cp .env.example .env        # completa SECRET_KEY, ADMIN_PASSWORD y POSTGRES_PASSWORD
docker compose up -d
```

Sin Docker (Python 3.11 o superior):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # en Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env        # completa SECRET_KEY y ADMIN_PASSWORD; deja DATABASE_URL comentado (usa SQLite)
uvicorn app.main:app --reload
```

Abre **http://localhost:8000/docs**: ahí está toda la API documentada y puedes probar cada endpoint
desde el navegador (botón *Authorize* para iniciar sesión).

Para correr las pruebas: `pytest -q`

## Flujo de uso

| Paso | Endpoint |
|---|---|
| 1. El usuario pide cuenta | `POST /auth/solicitar` |
| 2. El admin ve pendientes | `GET /admin/usuarios?estado=pendiente` |
| 3. El admin aprueba (envía el código por correo, o te lo devuelve si no hay SMTP) | `POST /admin/usuarios/{id}/aprobar` |
| 4. El usuario activa con el código `PRESC-ACT-…` | `POST /auth/activar` |
| 5. Ingreso (usuario o correo) | `POST /auth/login` |
| 6. Crear lote | `POST /lotes` |
| 7. Subir imagen | `POST /lotes/{id}/vuelos` |
| 8. Ver estado y estadísticas NDVI | `GET /vuelos/{id}` |
| 9. Generar prescripción | `POST /vuelos/{id}/prescripciones` |
| 10. Descargar para el Agras | `GET /prescripciones/{id}/descargar` |
| 11. Informe PDF | `GET /prescripciones/{id}/informe.pdf` |

Otros: `GET /lotes/{id}/vuelos` (historial), `GET /vuelos/{id}/ndvi.png`, `GET /vuelos/{id}/ndvi.tif`,
`GET /prescripciones/{id}/zonas.geojson`, `GET /prescripciones/{id}/zonas.png`, y `DELETE` para lotes, vuelos y prescripciones.

### Subir imágenes

- **`modo=multibanda`**: ortomosaico con varias bandas. Indica `banda_rojo` y `banda_nir` (numeradas desde 1).
  Revisa el orden de bandas de tu exportación en QGIS antes de subir.
- **`modo=ndvi`**: GeoTIFF de una banda con NDVI ya calculado (valores entre −1 y 1), por ejemplo el que exporta DJI Terra.

El archivo debe estar georreferenciado. Se analiza a 0,5 m por píxel, que es más que suficiente para dosis variable con dron.

### Generar una prescripción

```json
{
  "name": "Urea V6",
  "product": "Urea",
  "unit": "kg/ha",
  "num_zones": 3,
  "method": "cuantiles",
  "doses": [150, 120, 90],
  "min_area_m2": 50
}
```

`doses` va **de NDVI bajo a NDVI alto**. En el ejemplo, la zona de menor vigor recibe 150 kg/ha.
`cuantiles` reparte el área en partes iguales; `intervalos` divide el rango de NDVI en tramos iguales.

## Archivos para el Agras

El `.zip` de cada prescripción trae:

```
DJI/Shapefile/limite.shp   límite del lote (WGS84)
DJI/Rx/prescripcion.tif    dosis por píxel en WGS84 (+ .tfw), 0 = fuera del lote
zonas/zonas.shp            zonas con ZONA, DOSIS, UNIDAD, AREA_HA, NDVI_MED…  (QGIS, Pix4D, etc.)
zonas/zonas.geojson        lo mismo en GeoJSON
LEEME.txt                  resumen y pasos de importación
```

En el control remoto: copia la carpeta `DJI` a la microSD, importa el límite como campo y, en
*Prescription Map*, elige `prescripcion.tif` con **Map Source: Other** y **Source unit: ha**.

> ⚠️ Esta estructura sigue la que usan otras plataformas para los Agras T, pero **pruébala primero en tu
> modelo y versión de firmware** con un lote pequeño, y confirma en el control que las dosis importadas
> coinciden con el `LEEME.txt` antes de aplicar.

## Publicar la imagen en GitHub Packages

El workflow `.github/workflows/backend.yml` corre los tests en cada cambio dentro de `backend/` y, en cada
push a `main`, publica la imagen en:

```
ghcr.io/prescriptordji/prescriptor-backend:latest
```

No necesitas configurar secretos: usa el `GITHUB_TOKEN` del propio repositorio. La primera vez, revisa en
tu perfil → *Packages* que el paquete quedó con la visibilidad que quieres (privado por defecto si el repo es privado).

Para versiones: crea un tag `v0.1.0` y se publica también `:0.1.0`.

## Desplegar

Cualquier servicio que corra contenedores sirve. Dos caminos simples:

1. **VPS con Docker** (el más barato y con más control): instala Docker, copia `docker-compose.yml` y `.env`,
   cambia `build: .` por `image: ghcr.io/prescriptordji/prescriptor-backend:latest` y ejecuta `docker compose up -d`.
   Pon delante un proxy con HTTPS (Caddy o Nginx con Let's Encrypt).
2. **Servicio gestionado** (Render, Railway, Fly.io, Cloud Run): apunta a la imagen de ghcr.io, agrega una base
   PostgreSQL y **un disco persistente montado en `/data`**, que es donde se guardan imágenes y resultados.

En ambos casos define `SECRET_KEY`, `ADMIN_PASSWORD`, `DATABASE_URL` y `CORS_ORIGINS`.

Los ortomosaicos pesan; deja espacio en disco y ajusta `MAX_UPLOAD_MB`. Si usas un proxy, sube también
su límite de tamaño de petición (en Nginx, `client_max_body_size`).

## Conectar el frontend

Ejemplo de ingreso desde `index.html`:

```js
const API = "https://tu-servidor.com";

const r = await fetch(`${API}/auth/login`, {
  method: "POST",
  body: new URLSearchParams({ username: usuario, password: clave }),
});
if (!r.ok) throw new Error((await r.json()).detail);
const { access_token } = await r.json();

// Llamadas posteriores
const lotes = await fetch(`${API}/lotes`, {
  headers: { Authorization: `Bearer ${access_token}` },
}).then(r => r.json());
```

Los mensajes de error (`detail`) vienen en español y se pueden mostrar tal cual.

## Pendientes conocidos

- Las tablas se crean al arrancar. Si más adelante cambias los modelos, agrega migraciones (Alembic).
- El procesamiento corre dentro del mismo proceso de la API. Para muchos usuarios simultáneos conviene
  moverlo a una cola de trabajos (RQ, Celery).
- No hay límite de intentos de ingreso; agrégalo en el proxy o con un middleware antes de abrirlo al público.
