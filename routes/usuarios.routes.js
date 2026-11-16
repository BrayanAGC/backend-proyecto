import express from 'express'
import bcrypt from 'bcryptjs'
import pool from '../db.js'
import {
  verificarToken,
  soloAdmin
} from '../middleware/auth.middleware.js'

const router = express.Router()

const ROLES_PERMITIDOS = [
  'Administrador',
  'Encargado del inventario'
]

const MAX_NOMBRE = 50
const MAX_EMAIL = 100
const MAX_PASSWORD_BYTES = 72

const obtenerId = (valor) => {
  const id = Number(valor)

  return Number.isInteger(id) && id > 0 ? id : null
}

const validarDatosUsuario = (
  body = {},
  { passwordObligatoria = false } = {}
) => {
  const datosRecibidos =
    body && typeof body === 'object'
      ? body
      : {}

  const nombre =
    typeof datosRecibidos.name === 'string'
      ? datosRecibidos.name.trim()
      : ''

  const email =
    typeof datosRecibidos.email === 'string'
      ? datosRecibidos.email.trim().toLowerCase()
      : ''

  const role =
    typeof datosRecibidos.role === 'string'
      ? datosRecibidos.role.trim()
      : ''

  const password = datosRecibidos.password

  if (!nombre || !email || !role) {
    return {
      error: 'Nombre, email y rol son obligatorios'
    }
  }

  if (nombre.length > MAX_NOMBRE) {
    return {
      error: `El nombre no puede superar los ${MAX_NOMBRE} caracteres`
    }
  }

  if (email.length > MAX_EMAIL) {
    return {
      error: `El email no puede superar los ${MAX_EMAIL} caracteres`
    }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      error: 'Ingresa un email válido'
    }
  }

  if (!ROLES_PERMITIDOS.includes(role)) {
    return {
      error: 'El rol seleccionado no es válido'
    }
  }

  if (
    passwordObligatoria &&
    (typeof password !== 'string' || password.length === 0)
  ) {
    return {
      error: 'La contraseña es obligatoria'
    }
  }

  if (
    password !== undefined &&
    password !== null &&
    typeof password !== 'string'
  ) {
    return {
      error: 'La contraseña no es válida'
    }
  }

  const cambiarPassword =
    typeof password === 'string' && password.length > 0

  if (cambiarPassword && password.length < 6) {
    return {
      error: 'La contraseña debe tener al menos 6 caracteres'
    }
  }

  if (
    cambiarPassword &&
    Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES
  ) {
    return {
      error: 'La contraseña no puede superar los 72 bytes'
    }
  }

  return {
    datos: {
      nombre,
      email,
      role,
      password,
      cambiarPassword
    }
  }
}

const obtenerRolId = async (conexion, nombreRol) => {
  const [roles] = await conexion.query(
    'SELECT idRoles FROM Roles WHERE Nombre_Rol = ? LIMIT 1',
    [nombreRol]
  )

  return roles[0]?.idRoles || null
}

const obtenerMensajeDuplicado = (filas, nombre, email) => {
  const conflicto = filas[0]

  if (!conflicto) return null

  if (
    String(conflicto.Email).toLowerCase() ===
    email.toLowerCase()
  ) {
    return 'El email ya está registrado'
  }

  if (
    String(conflicto.Nombre).toLowerCase() ===
    nombre.toLowerCase()
  ) {
    return 'El nombre ya está registrado'
  }

  return 'El usuario ya está registrado'
}

const responderErrorBaseDatos = (res, error, mensaje) => {
  console.error(mensaje, error)

  if (error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      message: 'El email o el nombre ya está registrado'
    })
  }

  return res.status(500).json({
    message: 'Error del servidor'
  })
}

// Obtener usuarios activos: solo administradores.

/**
 * @swagger
 * /api/usuarios:
 *   get:
 *     summary: Obtener usuarios activos
 *     description: Obtiene la lista de usuarios activos registrados en el sistema. Solo disponible para administradores.
 *     tags:
 *       - Usuarios
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de usuarios obtenida correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     example: 1
 *                   name:
 *                     type: string
 *                     example: Juan Pérez
 *                   email:
 *                     type: string
 *                     example: juan@gmail.com
 *                   role:
 *                     type: string
 *                     enum:
 *                       - Administrador
 *                       - Encargado del inventario
 *                     example: Administrador
 *       401:
 *         description: Token no proporcionado o inválido
 *       403:
 *         description: El usuario no tiene permisos de administrador
 *       500:
 *         description: Error al obtener usuarios
 */
router.get('/', verificarToken, soloAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         u.idUsuarios AS id,
         u.Nombre AS name,
         u.Email AS email,
         r.Nombre_Rol AS role
       FROM Usuarios u
       INNER JOIN Roles r
         ON u.Roles_idRoles = r.idRoles
       WHERE u.Activo = 1
       ORDER BY u.Nombre ASC`
    )

    return res.json(rows)
  } catch (error) {
    return responderErrorBaseDatos(
      res,
      error,
      'Error al obtener usuarios:'
    )
  }
})

// Crear usuario: solo administradores.

/**
 * @swagger
 * /api/usuarios:
 *   post:
 *     summary: Crear un usuario
 *     description: Registra un nuevo usuario en el sistema. Solo disponible para administradores.
 *     tags:
 *       - Usuarios
 *     security:
 *       - bearerAuth: []
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
 *               - role
 *             properties:
 *               name:
 *                 type: string
 *                 example: Juan Pérez
 *               email:
 *                 type: string
 *                 format: email
 *                 example: juan@gmail.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "123456"
 *               role:
 *                 type: string
 *                 enum:
 *                   - Administrador
 *                   - Encargado del inventario
 *                 example: Encargado del inventario
 *     responses:
 *       201:
 *         description: Usuario creado correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                   example: 5
 *                 message:
 *                   type: string
 *                   example: Usuario creado
 *       400:
 *         description: Faltan campos obligatorios o los datos no son válidos
 *       401:
 *         description: Token no proporcionado o inválido
 *       403:
 *         description: El usuario no tiene permisos de administrador
 *       409:
 *         description: El email o el nombre ya está registrado
 *       500:
 *         description: Error al crear usuario o configuración de roles inválida
 */
router.post('/', verificarToken, soloAdmin, async (req, res) => {
  const validacion = validarDatosUsuario(req.body, {
    passwordObligatoria: true
  })

  if (validacion.error) {
    return res.status(400).json({
      message: validacion.error
    })
  }

  const {
    nombre,
    email,
    role,
    password
  } = validacion.datos

  try {
    const [existentes] = await pool.query(
      `SELECT Nombre, Email
       FROM Usuarios
       WHERE Email = ? OR Nombre = ?
       LIMIT 1`,
      [email, nombre]
    )

    const mensajeDuplicado = obtenerMensajeDuplicado(
      existentes,
      nombre,
      email
    )

    if (mensajeDuplicado) {
      return res.status(409).json({
        message: mensajeDuplicado
      })
    }

    const rolId = await obtenerRolId(pool, role)

    if (!rolId) {
      console.error(`El rol no existe en la base de datos: ${role}`)

      return res.status(500).json({
        message: 'La configuración de roles no es válida'
      })
    }

    const hash = await bcrypt.hash(password, 10)

    const [resultado] = await pool.query(
      `INSERT INTO Usuarios
        (Nombre, Email, Contrasena, Roles_idRoles, Activo)
       VALUES (?, ?, ?, ?, 1)`,
      [nombre, email, hash, rolId]
    )

    return res.status(201).json({
      id: resultado.insertId,
      message: 'Usuario creado'
    })
  } catch (error) {
    return responderErrorBaseDatos(
      res,
      error,
      'Error al crear usuario:'
    )
  }
})

// Actualizar usuario: solo administradores.

/**
 * @swagger
 * /api/usuarios/{id}:
 *   put:
 *     summary: Actualizar un usuario
 *     description: Actualiza los datos de un usuario existente. Protege al último administrador activo (no puede quitársele el rol) y al propio usuario autenticado (no puede quitarse su propio rol de administrador). Solo disponible para administradores.
 *     tags:
 *       - Usuarios
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del usuario que se desea actualizar
 *         example: 2
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - role
 *             properties:
 *               name:
 *                 type: string
 *                 example: Juan Pérez
 *               email:
 *                 type: string
 *                 format: email
 *                 example: juan@gmail.com
 *               password:
 *                 type: string
 *                 format: password
 *                 nullable: true
 *                 description: Si se omite, la contraseña actual no se modifica
 *                 example: "123456"
 *               role:
 *                 type: string
 *                 enum:
 *                   - Administrador
 *                   - Encargado del inventario
 *                 example: Encargado del inventario
 *     responses:
 *       200:
 *         description: Usuario actualizado correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Usuario actualizado
 *       400:
 *         description: El identificador no es válido o los datos no son válidos
 *       401:
 *         description: Token no proporcionado o inválido
 *       403:
 *         description: El usuario no tiene permisos de administrador
 *       404:
 *         description: Usuario no encontrado
 *       409:
 *         description: >
 *           El email o el nombre ya está registrado, o la operación viola una regla
 *           de protección (no puedes quitarte tu propio rol de administrador,
 *           o debe existir al menos un administrador activo)
 *       500:
 *         description: Error al actualizar usuario o configuración de roles inválida
 */
router.put('/:id', verificarToken, soloAdmin, async (req, res) => {
  const id = obtenerId(req.params.id)

  if (!id) {
    return res.status(400).json({
      message: 'El identificador del usuario no es válido'
    })
  }

  const validacion = validarDatosUsuario(req.body)

  if (validacion.error) {
    return res.status(400).json({
      message: validacion.error
    })
  }

  const {
    nombre,
    email,
    role,
    password,
    cambiarPassword
  } = validacion.datos

  let conexion

  try {
    conexion = await pool.getConnection()
    await conexion.beginTransaction()

    const [usuarios] = await conexion.query(
      `SELECT
         u.idUsuarios,
         u.Nombre,
         u.Email,
         u.Activo,
         r.Nombre_Rol
       FROM Usuarios u
       INNER JOIN Roles r
         ON u.Roles_idRoles = r.idRoles
       WHERE u.idUsuarios = ?
       FOR UPDATE`,
      [id]
    )

    if (usuarios.length === 0 || usuarios[0].Activo !== 1) {
      await conexion.rollback()

      return res.status(404).json({
        message: 'Usuario no encontrado'
      })
    }

    const usuarioActual = usuarios[0]
    const esMismoUsuario =
      Number(req.usuario?.id) === id

    if (
      esMismoUsuario &&
      usuarioActual.Nombre_Rol === 'Administrador' &&
      role !== 'Administrador'
    ) {
      await conexion.rollback()

      return res.status(409).json({
        message: 'No puedes quitarte tu propio rol de administrador'
      })
    }

    const [duplicados] = await conexion.query(
      `SELECT Nombre, Email
       FROM Usuarios
       WHERE (Email = ? OR Nombre = ?)
         AND idUsuarios <> ?
       LIMIT 1`,
      [email, nombre, id]
    )

    const mensajeDuplicado = obtenerMensajeDuplicado(
      duplicados,
      nombre,
      email
    )

    if (mensajeDuplicado) {
      await conexion.rollback()

      return res.status(409).json({
        message: mensajeDuplicado
      })
    }

    if (
      usuarioActual.Nombre_Rol === 'Administrador' &&
      role !== 'Administrador'
    ) {
      const [administradores] = await conexion.query(
        `SELECT COUNT(*) AS cantidad
         FROM Usuarios u
         INNER JOIN Roles r
           ON u.Roles_idRoles = r.idRoles
         WHERE u.Activo = 1
           AND r.Nombre_Rol = 'Administrador'`
      )

      if (Number(administradores[0]?.cantidad || 0) <= 1) {
        await conexion.rollback()

        return res.status(409).json({
          message: 'Debe existir al menos un administrador activo'
        })
      }
    }

    const rolId = await obtenerRolId(conexion, role)

    if (!rolId) {
      await conexion.rollback()

      return res.status(500).json({
        message: 'La configuración de roles no es válida'
      })
    }

    if (cambiarPassword) {
      const hash = await bcrypt.hash(password, 10)

      await conexion.query(
        `UPDATE Usuarios
         SET Nombre = ?,
             Email = ?,
             Contrasena = ?,
             Roles_idRoles = ?
         WHERE idUsuarios = ?`,
        [nombre, email, hash, rolId, id]
      )
    } else {
      await conexion.query(
        `UPDATE Usuarios
         SET Nombre = ?,
             Email = ?,
             Roles_idRoles = ?
         WHERE idUsuarios = ?`,
        [nombre, email, rolId, id]
      )
    }

    await conexion.commit()

    return res.json({
      message: 'Usuario actualizado'
    })
  } catch (error) {
    if (conexion) {
      await conexion.rollback()
    }

    return responderErrorBaseDatos(
      res,
      error,
      'Error al actualizar usuario:'
    )
  } finally {
    conexion?.release()
  }
})

// Desactivar usuario: solo administradores.

/**
 * @swagger
 * /api/usuarios/{id}:
 *   delete:
 *     summary: Desactivar un usuario
 *     description: Desactiva un usuario cambiando su estado Activo a 0 (no elimina físicamente el registro). No permite que un administrador se desactive a sí mismo ni desactivar al último administrador activo. Solo disponible para administradores.
 *     tags:
 *       - Usuarios
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del usuario que se desea desactivar
 *         example: 2
 *     responses:
 *       200:
 *         description: Usuario desactivado correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Usuario desactivado correctamente
 *       400:
 *         description: El identificador del usuario no es válido
 *       401:
 *         description: Token no proporcionado o inválido
 *       403:
 *         description: El usuario no tiene permisos de administrador
 *       404:
 *         description: Usuario no encontrado
 *       409:
 *         description: >
 *           No puedes desactivar tu propio usuario, o no puedes desactivar
 *           al último administrador activo
 *       500:
 *         description: Error al desactivar usuario
 */
router.delete('/:id', verificarToken, soloAdmin, async (req, res) => {
  const id = obtenerId(req.params.id)

  if (!id) {
    return res.status(400).json({
      message: 'El identificador del usuario no es válido'
    })
  }

  if (Number(req.usuario?.id) === id) {
    return res.status(409).json({
      message: 'No puedes desactivar tu propio usuario'
    })
  }

  let conexion

  try {
    conexion = await pool.getConnection()
    await conexion.beginTransaction()

    const [usuarios] = await conexion.query(
      `SELECT
         u.idUsuarios,
         u.Activo,
         r.Nombre_Rol
       FROM Usuarios u
       INNER JOIN Roles r
         ON u.Roles_idRoles = r.idRoles
       WHERE u.idUsuarios = ?
       FOR UPDATE`,
      [id]
    )

    if (usuarios.length === 0 || usuarios[0].Activo !== 1) {
      await conexion.rollback()

      return res.status(404).json({
        message: 'Usuario no encontrado'
      })
    }

    if (usuarios[0].Nombre_Rol === 'Administrador') {
      const [administradores] = await conexion.query(
        `SELECT COUNT(*) AS cantidad
         FROM Usuarios u
         INNER JOIN Roles r
           ON u.Roles_idRoles = r.idRoles
         WHERE u.Activo = 1
           AND r.Nombre_Rol = 'Administrador'`
      )

      if (Number(administradores[0]?.cantidad || 0) <= 1) {
        await conexion.rollback()

        return res.status(409).json({
          message: 'No puedes desactivar al último administrador activo'
        })
      }
    }

    await conexion.query(
      `UPDATE Usuarios
       SET Activo = 0
       WHERE idUsuarios = ?`,
      [id]
    )

    await conexion.commit()

    return res.json({
      message: 'Usuario desactivado correctamente'
    })
  } catch (error) {
    if (conexion) {
      await conexion.rollback()
    }

    return responderErrorBaseDatos(
      res,
      error,
      'Error al desactivar usuario:'
    )
  } finally {
    conexion?.release()
  }
})

export default router