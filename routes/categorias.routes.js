import express from 'express'
import pool from '../db.js'
import {
  verificarToken,
  soloAdmin
} from '../middleware/auth.middleware.js'

const router = express.Router()

const MAX_NOMBRE = 50
const MAX_DESCRIPCION = 50
const MAX_SIMBOLOGIA = 50

const obtenerId = (valor) => {
  const id = Number(valor)

  return Number.isInteger(id) && id > 0 ? id : null
}

const obtenerDatosCategoria = (body = {}) => {
  const datosRecibidos =
    body && typeof body === 'object'
      ? body
      : {}

  const nombre =
    typeof datosRecibidos.nombre === 'string'
      ? datosRecibidos.nombre.trim()
      : ''

  const descripcion =
    typeof datosRecibidos.descripcion === 'string'
      ? datosRecibidos.descripcion.trim()
      : ''

  const simbologia =
    typeof datosRecibidos.simbologia === 'string'
      ? datosRecibidos.simbologia.trim()
      : ''

  return {
    nombre,
    descripcion,
    simbologia: simbologia || '📦'
  }
}

const validarDatosCategoria = (body) => {
  const datos = obtenerDatosCategoria(body)

  if (!datos.nombre) {
    return {
      error: 'El nombre de la categoría es obligatorio'
    }
  }

  if (datos.nombre.length > MAX_NOMBRE) {
    return {
      error: `El nombre no puede superar los ${MAX_NOMBRE} caracteres`
    }
  }

  if (datos.descripcion.length > MAX_DESCRIPCION) {
    return {
      error: `La descripción no puede superar los ${MAX_DESCRIPCION} caracteres`
    }
  }

  if (datos.simbologia.length > MAX_SIMBOLOGIA) {
    return {
      error: `La simbología no puede superar los ${MAX_SIMBOLOGIA} caracteres`
    }
  }

  return { datos }
}

const responderErrorBaseDatos = (res, error, mensaje) => {
  console.error(mensaje, error)

  if (error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      message: 'Ya existe una categoría con ese nombre'
    })
  }

  if (
    error.code === 'ER_ROW_IS_REFERENCED_2' ||
    error.errno === 1451
  ) {
    return res.status(409).json({
      message: 'No se puede eliminar la categoría porque tiene productos asociados'
    })
  }

  return res.status(500).json({
    message: 'Error del servidor'
  })
}

// Obtener categorías: cualquier usuario autenticado puede consultarlas.

/**
 * @swagger
 * /api/categorias:
 *   get:
 *     summary: Obtener todas las categorías
 *     description: Obtiene la lista completa de categorías registradas en el sistema.
 *     tags:
 *       - Categorías
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de categorías obtenida correctamente
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
 *                     example: Herramientas
 *                   description:
 *                     type: string
 *                     example: Herramientas manuales para trabajos de construcción
 *                   icon:
 *                     type: string
 *                     example: 🔨
 *       401:
 *         description: Token no proporcionado o inválido
 *       500:
 *         description: Error al obtener categorías
 */
router.get('/', verificarToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         idCategoria AS id,
         Nombre_Categoria AS name,
         Descripcion AS description,
         Simbologia AS icon
       FROM Categoria
       ORDER BY Nombre_Categoria ASC`
    )

    return res.json(rows)
  } catch (error) {
    return responderErrorBaseDatos(
      res,
      error,
      'Error al obtener categorías:'
    )
  }
})

// Crear categoría: solo administradores.

/**
 * @swagger
 * /api/categorias:
 *   post:
 *     summary: Crear una categoría
 *     description: Registra una nueva categoría en el sistema. Solo disponible para administradores.
 *     tags:
 *       - Categorías
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
 *                 example: Herramientas
 *               descripcion:
 *                 type: string
 *                 example: Herramientas manuales para trabajos de construcción
 *               simbologia:
 *                 type: string
 *                 example: 🔨
 *     responses:
 *       201:
 *         description: Categoría creada correctamente
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
 *                   example: Categoría creada
 *       400:
 *         description: El nombre es obligatorio o los datos no son válidos
 *       401:
 *         description: Token no proporcionado o inválido
 *       403:
 *         description: El usuario no tiene permisos de administrador
 *       409:
 *         description: Ya existe una categoría con ese nombre
 *       500:
 *         description: Error al crear categoría
 */
router.post('/', verificarToken, soloAdmin, async (req, res) => {
  const validacion = validarDatosCategoria(req.body)

  if (validacion.error) {
    return res.status(400).json({
      message: validacion.error
    })
  }

  const {
    nombre,
    descripcion,
    simbologia
  } = validacion.datos

  try {
    const [existentes] = await pool.query(
      `SELECT idCategoria
       FROM Categoria
       WHERE Nombre_Categoria = ?
       LIMIT 1`,
      [nombre]
    )

    if (existentes.length > 0) {
      return res.status(409).json({
        message: 'Ya existe una categoría con ese nombre'
      })
    }

    const [resultado] = await pool.query(
      `INSERT INTO Categoria
        (Nombre_Categoria, Descripcion, Simbologia)
       VALUES (?, ?, ?)`,
      [nombre, descripcion, simbologia]
    )

    return res.status(201).json({
      id: resultado.insertId,
      message: 'Categoría creada'
    })
  } catch (error) {
    return responderErrorBaseDatos(
      res,
      error,
      'Error al crear categoría:'
    )
  }
})

// Actualizar categoría: solo administradores.

/**
 * @swagger
 * /api/categorias/{id}:
 *   put:
 *     summary: Actualizar una categoría
 *     description: Actualiza la información de una categoría existente. Solo disponible para administradores.
 *     tags:
 *       - Categorías
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la categoría que se desea actualizar
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
 *                 example: Herramientas
 *               descripcion:
 *                 type: string
 *                 example: Herramientas manuales para trabajos de construcción
 *               simbologia:
 *                 type: string
 *                 example: 🔨
 *     responses:
 *       200:
 *         description: Categoría actualizada correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Categoría actualizada
 *       400:
 *         description: El identificador no es válido o los datos no son válidos
 *       401:
 *         description: Token no proporcionado o inválido
 *       403:
 *         description: El usuario no tiene permisos de administrador
 *       404:
 *         description: Categoría no encontrada
 *       409:
 *         description: Ya existe una categoría con ese nombre
 *       500:
 *         description: Error al actualizar categoría
 */
router.put('/:id', verificarToken, soloAdmin, async (req, res) => {
  const id = obtenerId(req.params.id)

  if (!id) {
    return res.status(400).json({
      message: 'El identificador de la categoría no es válido'
    })
  }

  const validacion = validarDatosCategoria(req.body)

  if (validacion.error) {
    return res.status(400).json({
      message: validacion.error
    })
  }

  const {
    nombre,
    descripcion,
    simbologia
  } = validacion.datos

  try {
    const [categoria] = await pool.query(
      `SELECT idCategoria
       FROM Categoria
       WHERE idCategoria = ?
       LIMIT 1`,
      [id]
    )

    if (categoria.length === 0) {
      return res.status(404).json({
        message: 'Categoría no encontrada'
      })
    }

    const [duplicados] = await pool.query(
      `SELECT idCategoria
       FROM Categoria
       WHERE Nombre_Categoria = ?
         AND idCategoria <> ?
       LIMIT 1`,
      [nombre, id]
    )

    if (duplicados.length > 0) {
      return res.status(409).json({
        message: 'Ya existe una categoría con ese nombre'
      })
    }

    await pool.query(
      `UPDATE Categoria
       SET Nombre_Categoria = ?,
           Descripcion = ?,
           Simbologia = ?
       WHERE idCategoria = ?`,
      [nombre, descripcion, simbologia, id]
    )

    return res.json({
      message: 'Categoría actualizada'
    })
  } catch (error) {
    return responderErrorBaseDatos(
      res,
      error,
      'Error al actualizar categoría:'
    )
  }
})

// Eliminar categoría: solo administradores.

/**
 * @swagger
 * /api/categorias/{id}:
 *   delete:
 *     summary: Eliminar una categoría
 *     description: Elimina una categoría del sistema. No permite eliminar categorías que tengan productos asociados. Solo disponible para administradores.
 *     tags:
 *       - Categorías
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la categoría que se desea eliminar
 *         example: 5
 *     responses:
 *       200:
 *         description: Categoría eliminada correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Categoría eliminada correctamente
 *       400:
 *         description: El identificador de la categoría no es válido
 *       401:
 *         description: Token no proporcionado o inválido
 *       403:
 *         description: El usuario no tiene permisos de administrador
 *       404:
 *         description: Categoría no encontrada
 *       409:
 *         description: No se puede eliminar la categoría porque tiene productos asociados
 *       500:
 *         description: Error al eliminar categoría
 */
router.delete('/:id', verificarToken, soloAdmin, async (req, res) => {
  const id = obtenerId(req.params.id)

  if (!id) {
    return res.status(400).json({
      message: 'El identificador de la categoría no es válido'
    })
  }

  try {
    const [categoria] = await pool.query(
      `SELECT idCategoria
       FROM Categoria
       WHERE idCategoria = ?
       LIMIT 1`,
      [id]
    )

    if (categoria.length === 0) {
      return res.status(404).json({
        message: 'Categoría no encontrada'
      })
    }

    const [productosRelacionados] = await pool.query(
      `SELECT COUNT(*) AS cantidad
       FROM Producto
       WHERE Categoria_idCategoria = ?`,
      [id]
    )

    if (Number(productosRelacionados[0]?.cantidad || 0) > 0) {
      return res.status(409).json({
        message: 'No se puede eliminar la categoría porque tiene productos asociados'
      })
    }

    await pool.query(
      'DELETE FROM Categoria WHERE idCategoria = ?',
      [id]
    )

    return res.json({
      message: 'Categoría eliminada correctamente'
    })
  } catch (error) {
    return responderErrorBaseDatos(
      res,
      error,
      'Error al eliminar categoría:'
    )
  }
})

export default router