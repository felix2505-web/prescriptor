import logging
import smtplib
from email.message import EmailMessage

from .config import get_settings

log = logging.getLogger("prescriptor.mail")


def send_mail(to: str, subject: str, body: str) -> bool:
    """Envía un correo. Devuelve False si no hay SMTP configurado o falla."""
    s = get_settings()
    if not s.smtp_enabled:
        log.info("SMTP no configurado; no se envió correo a %s", to)
        return False
    msg = EmailMessage()
    msg["From"] = s.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=20) as smtp:
            if s.smtp_tls:
                smtp.starttls()
            if s.smtp_user:
                smtp.login(s.smtp_user, s.smtp_password)
            smtp.send_message(msg)
        return True
    except Exception:  # noqa: BLE001 - el correo no debe tumbar la API
        log.exception("No se pudo enviar correo a %s", to)
        return False


def activation_mail(full_name: str, code: str, hours: int) -> tuple[str, str]:
    s = get_settings()
    subject = "Tu cuenta del Prescriptor NDVI fue aprobada"
    body = (
        f"Hola {full_name}:\n\n"
        "Tu solicitud de cuenta fue aprobada. Para activarla, abre la aplicación, "
        "ve a la pestaña «Activar cuenta» y pega este código:\n\n"
        f"{code}\n\n"
        f"El código vence en {hours} horas.\n\n"
        f"{s.frontend_url}\n"
    )
    return subject, body
