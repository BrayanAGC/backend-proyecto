import express from 'express'
import pool from '../db.js'
import {
  verificarToken,
  soloAdmin
} from '../middleware/auth.middleware.js'

const router = express.Router()

const MAX_NOMBRE = 50
const MAX_CONTACTO = 30

const obtenerId = (valor) => {
  const id = Number(valor)

  return Number.isInteger(id) && id > 0 ? id : null
}

const obtenerDatosProveedor = (body = {}) => {
  const datosRecibidos =
    body && typeof body === 'object'
      ? body
      : {}

  const nombre =
    typeof datosRecibidos.nombre === 'string'
      ? datosRecibidos.nombre.trim()
      : ''

  const contacto =
    typeof datosRecibidos.contacto === 'string'
      ? datosRecibidos.contacto.trim()
      : ''

  return {
    nombre,
    contacto: contacto || null
  }
}

const validarDatosProveedor = (body) => {
  const datos = obtenerDatosProveedor(body)

  if (!datos.nombre) {
    return {
      error: 'El nombre del proveedor es obligatorio'
    }
  }

  if (datos.nombre.length > MAX_NOMBRE) {
    return {
      error: `El nombre no puede superar los ${MAX_NOMBRE} caracteres`
    }
  }

  if (
    datos.contacto !== null &&
    datos.contacto.length > MAX_CONTACTO
  ) {
    return {
      error: `El contacto no puede superar los ${MAX_CONTACTO} caracteres`
    }
  }

  return { datos }
}

const responderErrorBaseDatos = (res, error, mensaje) => {
  console.error(mensaje, error)

  if (error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      message: 'Ya existe un proveedor con ese nombre'
    })
  }

  if (
    error.code === 'ER_ROW_IS_REFERENCED_2' ||
    error.errno === 1451
  ) {
    return res.status(409).json({
      message: 'No se puede eliminar el proveedor porque tiene productos asociados'
    })
  }

  return res.status(500).json({
    message: 'Error del servidor'
  })
}

// Obtener proveedores: cualquier usuario autenticado puede consultarlos.

/**
 * @swagger
 * /api/proveedores:
 *   get:
 *     summary: Obtener proveedores
 *     description: Obtiene la lista de todos los proveedores registrados en el sistema.
 *     tags:
 *       - Proveedores
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de proveedores obtenida correctamente
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
 *                   nombre:
 *                     type: string
 *                     example: Ferretería ABC
 *                   contacto:
 *                     type: string
 *                     nullable: true
 *                     example: "3001234567"
 *       401:
 *         description: Token no proporcionado o inválido
 *       500:
 *         description: Error al obtener proveedores
 */
router.get('/', verificarToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         idProveedor AS id,
         Nombre_Proveedor AS nombre,
         Contacto AS contacto
       FROM Proveedor
       ORDER BY Nombre_Proveedor ASC`
    )

    return res.json(rows)
  } catch (error) {
    return responderErrorBaseDatos(
      res,
      error,
      'Error al obtener proveedores:'
    )
  }
})

// Crear proveedor: solo administradores.

/**
 * @swagger
 * /api/proveedores:
 *   post:
 *     summary: Crear un proveedor
 *     description: Registra un nuevo proveedor en el sistema. Solo disponible para administradores.
 *     tags:
 *       - Proveedores
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nombre
 *             properties:
 *               nombre:
 *                 type: string
 *                 example: Ferretería ABC
 *               contacto:
 *                 type: string
 *                 nullable: true
 *                 example: "3001234567"
 *     responses:
 *       201:
 *         description: Proveedor creado correctamente
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
 *                   example: Proveedor creado
 *       400:
 *         description: El nombre es obligatorio o los datos no son válidos
 *       401:
 *         description: Token no proporcionado o inválido
 *       403:
 *         description: El usuario no tiene permisos de administrador
 *       409:
 *         description: Ya existe un proveedor con ese nombre
 *       500:
 *         description: Error al crear proveedor
 */
router.post('/', verificarToken, soloAdmin, async (req, res) => {
  const validacion = validarDatosProveedor(req.body)

  if (validacion.error) {
    return res.status(400).json({
      message: validacion.error
    })
  }

  const {
    nombre,
    contacto
  } = validacion.datos

  try {
    const [existentes] = await pool.query(
      `SELECT idProveedor
       FROM Proveedor
       WHERE Nombre_Proveedor = ?
       LIMIT 1`,
      [nombre]
    )

    if (existentes.length > 0) {
      return res.status(409).json({
        message: 'Ya existe un proveedor con ese nombre'
      })
    }

    const [resultado] = await pool.query(
      `INSERT INTO Proveedor
        (Nombre_Proveedor, Contacto)
       VALUES (?, ?)`,
      [nombre, contacto]
    )

    return res.status(201).json({
      id: resultado.insertId,
      message: 'Proveedor creado'
    })
  } catch (error) {
    return responderErrorBaseDatos(
      res,
      error,
      'Error al crear proveedor:'
    )
  }
})

// Actualizar proveedor: solo administradores.

/**
 * @swagger
 * /api/proveedores/{id}:
 *   put:
 *     summary: Actualizar un proveedor
 *     description: Actualiza la información de un proveedor existente. Solo disponible para administradores.
 *     tags:
 *       - Proveedores
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del proveedor que se desea actualizar
 *         example: 5
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nombre
 *             properties:
 *               nombre:
 *                 type: string
 *                 example: Ferretería ABC
 *               contacto:
 *                 type: string
 *                 nullable: true
 *                 example: "3001234567"
 *     responses:
 *       200:
 *         description: Proveedor actualizado correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Proveedor actualizado
 *       400:
 *         description: El identificador no es válido o los datos no son válidos
 *       401:
 *         description: Token no proporcionado o inválido
 *       403:
 *         description: El usuario no tiene permisos de administrador
 *       404:
 *         description: Proveedor no encontrado
 *       409:
 *         description: Ya existe un proveedor con ese nombre
 *       500:
 *         description: Error al actualizar proveedor
 */
router.put('/:id', verificarToken, soloAdmin, async (req, res) => {
  const id = obtenerId(req.params.id)

  if (!id) {
    return res.status(400).json({
      message: 'El identificador del proveedor no es válido'
    })
  }

  const validacion = validarDatosProveedor(req.body)

  if (validacion.error) {
    return res.status(400).json({
      message: validacion.error
    })
  }

  const {
    nombre,
    contacto
  } = validacion.datos

  try {
    const [proveedor] = await pool.query(
      `SELECT idProveedor
       FROM Proveedor
       WHERE idProveedor = ?
       LIMIT 1`,
      [id]
    )

    if (proveedor.length === 0) {
      return res.status(404).json({
        message: 'Proveedor no encontrado'
      })
    }

    const [duplicados] = await pool.query(
      `SELECT idProveedor
       FROM Proveedor
       WHERE Nombre_Proveedor = ?
         AND idProveedor <> ?
       LIMIT 1`,
      [nombre, id]
    )

    if (duplicados.length > 0) {
      return res.status(409).json({
        message: 'Ya existe un proveedor con ese nombre'
      })
    }

    await pool.query(
      `UPDATE Proveedor
       SET Nombre_Proveedor = ?,
           Contacto = ?
       WHERE idProveedor = ?`,
      [nombre, contacto, id]
    )

    return res.json({
      message: 'Proveedor actualizado'
    })
  } catch (error) {
    return responderErrorBaseDatos(
      res,
      error,
      'Error al actualizar proveedor:'
    )
  }
})

// Eliminar proveedor: solo administradores.

/**
 * @swagger
 * /api/proveedores/{id}:
 *   delete:
 *     summary: Eliminar un proveedor
 *     description: Elimina un proveedor del sistema. No permite eliminar proveedores que tengan productos asociados. Solo disponible para administradores.
 *     tags:
 *       - Proveedores
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del proveedor que se desea eliminar
 *         example: 5
 *     responses:
 *       200:
 *         description: Proveedor eliminado correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Proveedor eliminado correctamente
 *       400:
 *         description: El identificador del proveedor no es válido
 *       401:
 *         description: Token no proporcionado o inválido
 *       403:
 *         description: El usuario no tiene permisos de administrador
 *       404:
 *         description: Proveedor no encontrado
 *       409:
 *         description: No se puede eliminar el proveedor porque tiene productos asociados
 *       500:
 *         description: Error al eliminar proveedor
 */
router.delete('/:id', verificarToken, soloAdmin, async (req, res) => {
  const id = obtenerId(req.params.id)

  if (!id) {
    return res.status(400).json({
      message: 'El identificador del proveedor no es válido'
    })
  }

  try {
    const [proveedor] = await pool.query(
      `SELECT idProveedor
       FROM Proveedor
       WHERE idProveedor = ?
       LIMIT 1`,
      [id]
    )

    if (proveedor.length === 0) {
      return res.status(404).json({
        message: 'Proveedor no encontrado'
      })
    }

    const [productosRelacionados] = await pool.query(
      `SELECT COUNT(*) AS cantidad
       FROM Producto
       WHERE Proveedor_idProveedor = ?`,
      [id]
    )

    if (Number(productosRelacionados[0]?.cantidad || 0) > 0) {
      return res.status(409).json({
        message: 'No se puede eliminar el proveedor porque tiene productos asociados'
      })
    }

    await pool.query(
      'DELETE FROM Proveedor WHERE idProveedor = ?',
      [id]
    )

    return res.json({
      message: 'Proveedor eliminado correctamente'
    })
  } catch (error) {
    return responderErrorBaseDatos(
      res,
      error,
      'Error al eliminar proveedor:'
    )
  }
})

export default router