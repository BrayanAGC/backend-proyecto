import crypto from 'crypto'
import express from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
import pool from '../db.js'
import { enviarCorreo } from '../services/email.service.js'
import { verificarToken } from '../middleware/auth.middleware.js'

dotenv.config()

const router = express.Router()

const crearToken = (usuario) => jwt.sign(
  {
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    role: usuario.role
  },
  process.env.JWT_SECRET,
  { expiresIn: '4h' }
)

// LOGIN

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Iniciar sesión
 *     description: Autentica un usuario y genera un token JWT válido por 4 horas.
 *     tags:
 *       - Autenticación
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: admin@ferreteria.com
 *               password:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Inicio de sesión exitoso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 token:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                 usuario:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     nombre:
 *                       type: string
 *                       example: Administrador
 *                     email:
 *                       type: string
 *                       example: admin@ferreteria.com
 *                     role:
 *                       type: string
 *                       example: Administrador
 *       400:
 *         description: Email y contraseña son obligatorios
 *       401:
 *         description: Credenciales inválidas
 *       500:
 *         description: Error del servidor
 */
router.post('/login', async (req, res) => {
  const email = req.body.email?.trim()
  const password = req.body.password

  if (!email || !password) {
    return res.status(400).json({
      message: 'Email y contraseña son obligatorios'
    })
  }

  try {
    const [rows] = await pool.query(
      `SELECT u.idUsuarios,
              u.Nombre,
              u.Email,
              u.Contrasena,
              r.Nombre_Rol
       FROM Usuarios u
       JOIN Roles r ON u.Roles_idRoles = r.idRoles
       WHERE u.Email = ?
         AND u.Activo = 1`,
      [email]
    )

    if (rows.length === 0) {
      return res.status(401).json({
        message: 'Credenciales inválidas'
      })
    }

    const registro = rows[0]

    const passwordValida = await bcrypt.compare(
      password,
      registro.Contrasena
    )

    if (!passwordValida) {
      return res.status(401).json({
        message: 'Credenciales inválidas'
      })
    }

    const usuario = {
      id: registro.idUsuarios,
      nombre: registro.Nombre,
      email: registro.Email,
      role: registro.Nombre_Rol
    }

    res.json({
      success: true,
      token: crearToken(usuario),
      usuario
    })
  } catch (error) {
    console.error('Error en login:', error)

    res.status(500).json({
      message: 'Error del servidor'
    })
  }
})

// REGISTRO

/**
 * @swagger
 * /api/auth/registro:
 *   post:
 *     summary: Registrar usuario
 *     description: Registra un nuevo usuario en el sistema con el rol "Encargado del inventario" (rol fijo, no elegible) y devuelve un token de sesión inmediato. Es un endpoint público, sin aprobación de un administrador.
 *     tags:
 *       - Autenticación
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: Juan Pérez
 *               email:
 *                 type: string
 *                 example: juan@gmail.com
 *               password:
 *                 type: string
 *                 description: Mínimo 6 caracteres
 *                 example: "123456"
 *     responses:
 *       201:
 *         description: Usuario registrado correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 token:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                 usuario:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 8
 *                     nombre:
 *                       type: string
 *                       example: Juan Pérez
 *                     email:
 *                       type: string
 *                       example: juan@gmail.com
 *                     role:
 *                       type: string
 *                       example: Encargado del inventario
 *       400:
 *         description: Faltan campos obligatorios, la contraseña es muy corta o el email ya está registrado
 *       500:
 *         description: Error del servidor
 */
router.post('/registro', async (req, res) => {
  const name = req.body.name?.trim()
  const email = req.body.email?.trim()
  const password = req.body.password

  if (!name || !email || !password) {
    return res.status(400).json({
      message: 'Nombre, email y contraseña son obligatorios'
    })
  }

  if (password.length < 6) {
    return res.status(400).json({
      message: 'La contraseña debe tener al menos 6 caracteres'
    })
  }

  try {
    const [existentes] = await pool.query(
      'SELECT idUsuarios FROM Usuarios WHERE Email = ?',
      [email]
    )

    if (existentes.length > 0) {
      return res.status(400).json({
        message: 'El email ya está registrado'
      })
    }

    const hash = await bcrypt.hash(password, 10)

    const [result] = await pool.query(
      `INSERT INTO Usuarios
        (Nombre, Email, Contrasena, Roles_idRoles, Activo)
       VALUES (?, ?, ?, 2, 1)`,
      [name, email, hash]
    )

    const usuario = {
      id: result.insertId,
      nombre: name,
      email,
      role: 'Encargado del inventario'
    }

    res.status(201).json({
      success: true,
      token: crearToken(usuario),
      usuario
    })
  } catch (error) {
    console.error('Error en registro:', error)

    res.status(500).json({
      message: 'Error del servidor'
    })
  }
})

// SESIÓN ACTUAL
// JWT_SECRET permanece exclusivamente en el backend.

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Obtener la sesión actual
 *     description: Devuelve los datos del usuario autenticado a partir del token JWT enviado.
 *     tags:
 *       - Autenticación
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sesión válida
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 usuario:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     nombre:
 *                       type: string
 *                       example: Administrador
 *                     email:
 *                       type: string
 *                       example: admin@ferreteria.com
 *                     role:
 *                       type: string
 *                       example: Administrador
 *       401:
 *         description: Token no proporcionado, inválido o el usuario ya no está activo
 *       500:
 *         description: Error del servidor
 */
router.get('/me', verificarToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.idUsuarios AS id,
              u.Nombre AS nombre,
              u.Email AS email,
              r.Nombre_Rol AS role
       FROM Usuarios u
       JOIN Roles r ON u.Roles_idRoles = r.idRoles
       WHERE u.idUsuarios = ?
         AND u.Activo = 1`,
      [req.usuario.id]
    )

    if (rows.length === 0) {
      return res.status(401).json({
        message: 'Sesión no válida'
      })
    }

    res.json({
      usuario: rows[0]
    })
  } catch (error) {
    console.error('Error validando sesión:', error)

    res.status(500).json({
      message: 'Error del servidor'
    })
  }
})

// SOLICITAR RECUPERACIÓN DE CONTRASEÑA
// Esta es la única ruta de solicitud de recuperación.

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Solicitar recuperación de contraseña
 *     description: Envía un enlace de restablecimiento al correo si existe una cuenta activa asociada. La respuesta es siempre neutra (no revela si el correo está registrado), como medida de seguridad.
 *     tags:
 *       - Autenticación
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 example: juan@gmail.com
 *     responses:
 *       200:
 *         description: Respuesta neutra — se envía tanto si el correo existe como si no
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Si el correo existe, se enviará un enlace.
 *       400:
 *         description: El correo es obligatorio
 *       500:
 *         description: Error al enviar correo
 */
router.post('/forgot-password', async (req, res) => {
  const email = req.body.email?.trim()

  const respuestaNeutra = {
    success: true,
    message: 'Si el correo existe, se enviará un enlace.'
  }

  if (!email) {
    return res.status(400).json({
      message: 'El correo es obligatorio'
    })
  }

  try {
    const [usuarios] = await pool.query(
      `SELECT idUsuarios, Email
       FROM Usuarios
       WHERE Email = ?
         AND Activo = 1`,
      [email]
    )

    // No se revela si el correo está registrado.
    if (usuarios.length === 0) {
      return res.json(respuestaNeutra)
    }

    const usuario = usuarios[0]
    const token = crypto.randomBytes(32).toString('hex')
    const expiracion = new Date(Date.now() + 60 * 60 * 1000)

    // El usuario solo tendrá un token activo.
    await pool.query(
      'DELETE FROM password_resets WHERE usuario_id = ?',
      [usuario.idUsuarios]
    )

    await pool.query(
      `INSERT INTO password_resets
        (usuario_id, token, expiracion)
       VALUES (?, ?, ?)`,
      [usuario.idUsuarios, token, expiracion]
    )

     const frontendUrl =
      process.env.FRONTEND_URL || 'http://localhost:5173'

    const enlaceWeb = `${frontendUrl}/reset-password/${token}`
    const enlaceApp = `ferreteria://reset-password/${token}`
    await enviarCorreo(usuario.Email, enlaceWeb, enlaceApp)


  const enlace = `${frontendUrl}/reset-password/${token}`
    await enviarCorreo(usuario.Email, enlace)

    res.json(respuestaNeutra)
  } catch (error) {
    console.error(
      'Error en recuperación de contraseña:',
      error
    )

    res.status(500).json({
      message: 'Error al enviar correo'
    })
  }
})

// RESTABLECER CONTRASEÑA

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Restablecer contraseña
 *     description: Cambia la contraseña de un usuario usando el token recibido por correo. El token es de un solo uso y expira 1 hora después de ser generado.
 *     tags:
 *       - Autenticación
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - password
 *             properties:
 *               token:
 *                 type: string
 *                 example: 3f9c1a2b8e...
 *               password:
 *                 type: string
 *                 description: Mínimo 6 caracteres
 *                 example: "nuevaClave123"
 *     responses:
 *       200:
 *         description: Contraseña actualizada correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Contraseña actualizada correctamente
 *       400:
 *         description: Faltan campos, la contraseña es muy corta, o el token es inválido/expirado
 *       500:
 *         description: Error al actualizar contraseña
 */
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body

  if (!token || !password) {
    return res.status(400).json({
      message: 'Token y contraseña son obligatorios'
    })
  }

  if (password.length < 6) {
    return res.status(400).json({
      message: 'La contraseña debe tener al menos 6 caracteres'
    })
  }

  try {
    const [rows] = await pool.query(
      `SELECT usuario_id
       FROM password_resets
       WHERE token = ?
         AND expiracion > NOW()
       ORDER BY id DESC
       LIMIT 1`,
      [token]
    )

    if (rows.length === 0) {
      return res.status(400).json({
        message: 'Token inválido o expirado'
      })
    }

    const usuarioId = rows[0].usuario_id
    const hash = await bcrypt.hash(password, 10)

    const [resultado] = await pool.query(
      `UPDATE Usuarios
       SET Contrasena = ?
       WHERE idUsuarios = ?
         AND Activo = 1`,
      [hash, usuarioId]
    )

    if (resultado.affectedRows === 0) {
      return res.status(400).json({
        message: 'No se pudo actualizar la contraseña'
      })
    }

    // El token se invalida después de utilizarlo.
    await pool.query(
      'DELETE FROM password_resets WHERE usuario_id = ?',
      [usuarioId]
    )

    res.json({
      success: true,
      message: 'Contraseña actualizada correctamente'
    })
  } catch (error) {
    console.error(
      'Error restableciendo contraseña:',
      error
    )

    res.status(500).json({
      message: 'Error al actualizar contraseña'
    })
  }
})

export default router