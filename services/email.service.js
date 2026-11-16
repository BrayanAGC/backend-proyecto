import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
})

export const enviarCorreo = async (destino, enlaceWeb, enlaceApp) => {
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: destino,
    subject: 'Recuperación de contraseña',
    html: `
      <h2>Recuperación de contraseña</h2>
      <p>Si abres el correo en el <b>celular</b>, usa este botón:</p>

      <a href="${enlaceApp}"
         style="
         background:#ffc107;
         color:black;
         padding:12px 20px;
         text-decoration:none;
         border-radius:6px;">
         Abrir en la app
      </a>

      <p style="margin-top:20px;">Si estás en el <b>computador</b>, usa este:</p>

      <a href="${enlaceWeb}"
         style="
         background:#e0e0e0;
         color:black;
         padding:12px 20px;
         text-decoration:none;
         border-radius:6px;">
         Restablecer en el navegador
      </a>

      <p style="margin-top:20px;">Este enlace expirará en 1 hora.</p>
    `
  })
}