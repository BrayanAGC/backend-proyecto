import express from 'express'
import pool from '../db.js'
import { verificarToken } from '../middleware/auth.middleware.js'

const router = express.Router()

// El historial es visible para cualquier usuario autenticado.
// Se usa LEFT JOIN con Usuarios porque los movimientos iniciales
// pueden tener Usuarios_idUsuarios = NULL.

/**
 * @swagger
 * /api/movimientos:
 *   get:
 *     summary: Obtener movimientos de inventario
 *     description: Obtiene el historial de movimientos de inventario ordenado desde el más reciente hasta el más antiguo.
 *     tags:
 *       - Movimientos
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de movimientos obtenida correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     example: 15
 *                   fecha:
 *                     type: string
 *                     format: date-time
 *                     example: 2026-09-06T15:30:00.000Z
 *                   tipo:
 *                     type: string
 *                     enum:
 *                       - Entrada
 *                       - Salida
 *                     example: Entrada
 *                   cantidad:
 *                     type: integer
 *                     example: 20
 *                   costoUnitario:
 *                     type: number
 *                     format: float
 *                     nullable: true
 *                     description: Costo real pagado por unidad, solo presente en movimientos de Entrada registrados como compra a proveedor. Los movimientos anteriores a esta función, o las Salidas, vienen en null.
 *                     example: 18000
 *                   metodoPago:
 *                     type: string
 *                     nullable: true
 *                     example: Contado
 *                   producto:
 *                     type: string
 *                     example: Martillo
 *                   usuario:
 *                     type: string
 *                     nullable: true
 *                     example: Juan Pérez
 *       401:
 *         description: Token no proporcionado o inválido
 *       500:
 *         description: Error al obtener movimientos
 */
router.get('/', verificarToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         m.idMovimiento_Inventario AS id,
         m.Fecha_Movimiento AS fecha,
         m.Tipo_Movimiento AS tipo,
         m.Cantidad_Movimiento AS cantidad,
         m.Costo_Unitario AS costoUnitario,
         m.Metodo_Pago AS metodoPago,
         p.Nombre_Producto AS producto,
         u.Nombre AS usuario
       FROM Movimiento_Inventario m
       INNER JOIN Producto p
         ON m.Producto_idProducto = p.idProducto
       LEFT JOIN Usuarios u
         ON m.Usuarios_idUsuarios = u.idUsuarios
       ORDER BY
         m.Fecha_Movimiento DESC,
         m.idMovimiento_Inventario DESC`
    )

    return res.json(rows)
  } catch (error) {
    console.error('Error al obtener movimientos:', error)

    return res.status(500).json({
      message: 'Error al obtener movimientos'
    })
  }
})

export default router