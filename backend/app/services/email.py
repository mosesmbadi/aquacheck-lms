import os
import smtplib
import ssl
from email.message import EmailMessage
from typing import Iterable, Optional


class EmailConfigError(RuntimeError):
    pass


def _cfg():
    host = os.getenv("SMTP_HOST")
    if not host:
        raise EmailConfigError("SMTP_HOST is not configured in environment")
    return {
        "host": host,
        "port": int(os.getenv("SMTP_PORT", "587")),
        "user": os.getenv("SMTP_USER"),
        "password": os.getenv("SMTP_PASSWORD"),
        "from_addr": os.getenv("SMTP_FROM") or os.getenv("SMTP_USER") or "no-reply@aquacheck.local",
        "from_name": os.getenv("SMTP_FROM_NAME", "AquaCheck Laboratories"),
        "use_tls": os.getenv("SMTP_USE_TLS", "true").lower() in ("1", "true", "yes"),
        "use_ssl": os.getenv("SMTP_USE_SSL", "false").lower() in ("1", "true", "yes"),
    }


def send_email(
    to: Iterable[str],
    subject: str,
    body: str,
    html: Optional[str] = None,
    attachments: Optional[Iterable[tuple]] = None,  # [(filename, bytes, mime_type)]
) -> None:
    cfg = _cfg()
    recipients = [addr for addr in to if addr]
    if not recipients:
        raise EmailConfigError("No recipient email addresses provided")

    msg = EmailMessage()
    msg["From"] = f"{cfg['from_name']} <{cfg['from_addr']}>"
    msg["To"] = ", ".join(recipients)
    msg["Subject"] = subject
    msg.set_content(body)
    if html:
        msg.add_alternative(html, subtype="html")

    for att in attachments or []:
        filename, data, mime = att
        maintype, _, subtype = mime.partition("/")
        msg.add_attachment(data, maintype=maintype or "application", subtype=subtype or "octet-stream", filename=filename)

    if cfg["use_ssl"]:
        ctx = ssl.create_default_context()
        with smtplib.SMTP_SSL(cfg["host"], cfg["port"], context=ctx) as server:
            if cfg["user"]:
                server.login(cfg["user"], cfg["password"] or "")
            server.send_message(msg)
    else:
        with smtplib.SMTP(cfg["host"], cfg["port"]) as server:
            server.ehlo()
            if cfg["use_tls"]:
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
            if cfg["user"]:
                server.login(cfg["user"], cfg["password"] or "")
            server.send_message(msg)
