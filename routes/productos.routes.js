import express from 'express'
import pool from '../db.js'
import {
  verificarToken,
  soloAdmin
} from '../middleware/auth.middleware.js'

const router = express.Router()

const METODOS_PAGO = new Set([
  'Efectivo',
  'Nequi',
  'Daviplata',
  'Tarjeta Débito',
  'Tarjeta Crédito',
  'Transferencia'
])

const tieneValor = (valor) =>
  valor !== undefined &&
  valor !== null &&
  String(valor).trim() !== ''

const convertirEntero = (
  valor,
  valorPorDefecto = null
) => {
  if (!tieneValor(valor)) return valorPorDefecto

  const numero = Number(valor)
  return Number.isInteger(numero) ? numero : null
}

const convertirDecimal = (
  valor,
  valorPorDefecto = null
) => {
  if (!tieneValor(valor)) return valorPorDefecto

  const numero = Number(valor)
  return Number.isFinite(numero) ? numero : null
}

const errorDeValidacion = (
  message,
  statusCode = 400
) => {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

const resolverCategoria = async (
  conexion,
  nombre
) => {
  if (!tieneValor(nombre)) return null

  const nombreNormalizado = String(nombre).trim()

  const [categorias] = await conexion.query(
    `SELECT idCategoria
     FROM Categoria
     WHERE Nombre_Categoria = ?
     LIMIT 1`,
    [nombreNormalizado]
  )

  if (categorias.length === 0) {
    throw errorDeValidacion(
      'La categoría seleccionada no existe'
    )
  }

  return categorias[0].idCategoria
}

const resolverProveedor = async (
  conexion,
  nombre
) => {
  if (!tieneValor(nombre)) return null

  const nombreNormalizado = String(nombre).trim()

  if (nombreNormalizado.length > 50) {
    throw errorDeValidacion(
      'El nombre del proveedor no puede superar los 50 caracteres'
    )
  }

  const [resultado] = await conexion.query(
    `INSERT INTO Proveedor (Nombre_Proveedor)
     VALUES (?)
     ON DUPLICATE KEY UPDATE
       idProveedor = LAST_INSERT_ID(idProveedor)`,
    [nombreNormalizado]
  )

  return resultado.insertId
}

const obtenerStock = async (
  conexion,
  productoId
) => {
  const [filas] = await conexion.query(
    `SELECT COALESCE(SUM(
       CASE
         WHEN Tipo_Movimiento = 'Entrada'
           THEN Cantidad_Movimiento
         WHEN Tipo_Movimiento = 'Salida'
           THEN -Cantidad_Movimiento
         ELSE 0
       END
     ), 0) AS stock
     FROM Movimiento_Inventario
     WHERE Producto_idProducto = ?`,
    [productoId]
  )

  return Number(filas[0]?.stock) || 0
}

const obtenerIdProducto = (valor) => {
  const id = convertirEntero(valor)

  if (!id || id < 1) {
    throw errorDeValidacion(
      'El identificador del producto no es válido'
    )
  }

  return id
}

const obtenerUsuarioId = (usuario) => {
  const id = convertirEntero(usuario?.id)

  if (!id || id < 1) {
    throw errorDeValidacion(
      'La sesión no contiene un usuario válido',
      401
    )
  }

  return id
}

// OBTENER TODOS LOS PRODUCTOS

/**
 * @swagger
 * /api/productos:
 *   get:
 *     summary: Obtener productos
 *     description: Obtiene la lista de productos del inventario. Permite filtrar por categoría, ordenar por precio y consultar productos con stock bajo.
 *     tags:
 *       - Productos
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: categoria
 *         required: false
 *         schema:
 *           type: string
 *         description: Nombre de la categoría por la que se desea filtrar
 *         example: Herramientas
 *       - in: query
 *         name: orden
 *         required: false
 *         schema:
 *           type: string
 *           enum:
 *             - precioAsc
 *             - precioDesc
 *         description: Ordenar los productos por precio
 *         example: precioAsc
 *       - in: query
 *         name: stock
 *         required: false
 *         schema:
 *           type: string
 *           enum:
 *             - bajo
 *         description: Mostrar únicamente productos con stock igual o inferior al stock mínimo
 *         example: bajo
 *     responses:
 *       200:
 *         description: Lista de productos obtenida correctamente
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
 *                     example: Martillo
 *                   image:
 *                     type: string
 *                     nullable: true
 *                     example: martillo.jpg
 *                   minStock:
 *                     type: integer
 *                     example: 10
 *                   currentLocation:
 *                     type: string
 *                     example: Estante 1
 *                   price:
 *                     type: number
 *                     format: float
 *                     example: 25000
 *                   wholesalePrice:
 *                     type: number
 *                     format: float
 *                     example: 20000
 *                   profit:
 *                     type: number
 *                     format: float
 *                     example: 5000
 *                   category:
 *                     type: string
 *                     nullable: true
 *                     example: Herramientas
 *                   categoriaId:
 *                     type: integer
 *                     nullable: true
 *                     example: 2
 *                   mainSupplier:
 *                     type: string
 *                     nullable: true
 *                     example: Proveedor ABC
 *                   proveedorId:
 *                     type: integer
 *                     nullable: true
 *                     example: 3
 *                   stock:
 *                     type: integer
 *                     example: 25
 *       401:
 *         description: Token no proporcionado o inválido
 *       500:
 *         description: Error al obtener productos
 */
router.get('/', verificarToken, async (req, res) => {
  const {
    categoria,
    orden,
    stock
  } = req.query

  const condiciones = []
  const parametros = []

  // Solo mostramos productos activos (los "eliminados" quedan ocultos).
  condiciones.push('p.Activo = 1')

  if (tieneValor(categoria)) {
    condiciones.push('c.Nombre_Categoria = ?')
    parametros.push(String(categoria).trim())
  }

  let consulta = `
    SELECT
      p.idProducto AS id,
      p.Nombre_Producto AS name,
      p.Imagen AS image,
      p.Stock_Minimo AS minStock,
      p.ubicacion AS currentLocation,
      p.price,
      p.wholesalePrice,
      p.profit,
      c.Nombre_Categoria AS category,
      c.idCategoria AS categoriaId,
      pr.Nombre_Proveedor AS mainSupplier,
      pr.idProveedor AS proveedorId,
      COALESCE(SUM(
        CASE
          WHEN m.Tipo_Movimiento = 'Entrada'
            THEN m.Cantidad_Movimiento
          WHEN m.Tipo_Movimiento = 'Salida'
            THEN -m.Cantidad_Movimiento
          ELSE 0
        END
      ), 0) AS stock
    FROM Producto p
    LEFT JOIN Categoria c
      ON p.Categoria_idCategoria = c.idCategoria
    LEFT JOIN Proveedor pr
      ON p.Proveedor_idProveedor = pr.idProveedor
    LEFT JOIN Movimiento_Inventario m
      ON p.idProducto = m.Producto_idProducto
  `

  if (condiciones.length > 0) {
    consulta += ` WHERE ${condiciones.join(' AND ')}`
  }

  consulta += `
    GROUP BY
      p.idProducto,
      p.Nombre_Producto,
      p.Imagen,
      p.Stock_Minimo,
      p.ubicacion,
      p.price,
      p.wholesalePrice,
      p.profit,
      c.Nombre_Categoria,
      c.idCategoria,
      pr.Nombre_Proveedor,
      pr.idProveedor
  `

  if (stock === 'bajo') {
    consulta += `
      HAVING stock <= p.Stock_Minimo
    `
  } else if (stock === 'agotado') {
    consulta += `
      HAVING stock = 0
    `
  }

  if (orden === 'precioAsc') {
    consulta += ' ORDER BY p.price ASC'
  } else if (orden === 'precioDesc') {
    consulta += ' ORDER BY p.price DESC'
  } else {
    consulta += ' ORDER BY p.Nombre_Producto ASC'
  }

  try {
    const [filas] = await pool.query(
      consulta,
      parametros
    )

    res.json(filas)
  } catch (error) {
    console.error(
      'Error obteniendo productos:',
      error
    )

    res.status(500).json({
      message: 'Error al obtener productos'
    })
  }
})

// CREAR PRODUCTO

/**
 * @swagger
 * /api/productos:
 *   post:
 *     summary: Crear un producto
 *     description: Registra un nuevo producto en el inventario. La ganancia (profit) se calcula automáticamente como price - wholesalePrice y no se recibe como campo de entrada. Solo disponible para administradores.
 *     tags:
 *       - Productos
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
 *               - mainSupplier
 *               - price
 *               - wholesalePrice
 *             properties:
 *               name:
 *                 type: string
 *                 example: Martillo
 *               minStock:
 *                 type: integer
 *                 example: 10
 *               stock:
 *                 type: integer
 *                 description: Stock inicial (opcional, entero mayor o igual a cero)
 *                 example: 25
 *               currentLocation:
 *                 type: string
 *                 example: Estante 1
 *               category:
 *                 type: string
 *                 example: Herramientas
 *               mainSupplier:
 *                 type: string
 *                 example: Proveedor ABC
 *               price:
 *                 type: number
 *                 format: float
 *                 description: Debe ser mayor que wholesalePrice
 *                 example: 25000
 *               wholesalePrice:
 *                 type: number
 *                 format: float
 *                 example: 20000
 *               image:
 *                 type: string
 *                 nullable: true
 *                 example: martillo.jpg
 *     responses:
 *       201:
 *         description: Producto creado correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                   example: 10
 *                 message:
 *                   type: string
 *                   example: Producto creado
 *       400:
 *         description: Faltan campos obligatorios, o los precios/nombre/ubicación no son válidos
 *       401:
 *         description: Token no proporcionado o inválido
 *       403:
 *         description: El usuario no tiene permisos de administrador
 *       409:
 *         description: Ya existe un producto con ese nombre
 *       500:
 *         description: Error al crear producto
 */
router.post(
  '/',
  verificarToken,
  soloAdmin,
  async (req, res) => {
    let conexion

    try {
      const {
        name,
        minStock,
        stock,
        currentLocation,
        category,
        mainSupplier,
        price,
        wholesalePrice,
        image
      } = req.body

      const nombre = String(name || '').trim()
      const proveedor = String(
        mainSupplier || ''
      ).trim()

      const ubicacion = tieneValor(currentLocation)
        ? String(currentLocation).trim()
        : 'Estante 1'

      if (!nombre || !proveedor) {
        throw errorDeValidacion(
          'El nombre y el proveedor son obligatorios'
        )
      }

      if (nombre.length > 50) {
        throw errorDeValidacion(
          'El nombre no puede superar los 50 caracteres'
        )
      }

      if (ubicacion.length > 50) {
        throw errorDeValidacion(
          'La ubicación no puede superar los 50 caracteres'
        )
      }

      const stockMinimo = convertirEntero(
        minStock,
        0
      )

      const stockInicial = convertirEntero(
        stock,
        0
      )

      const precio = convertirDecimal(price)

      const precioMayorista = convertirDecimal(
        wholesalePrice
      )

      if (
        stockMinimo === null ||
        stockMinimo < 0 ||
        stockInicial === null ||
        stockInicial < 0
      ) {
        throw errorDeValidacion(
          'El stock debe ser un número entero igual o mayor que cero'
        )
      }

      if (
        precio === null ||
        precio < 0 ||
        precioMayorista === null ||
        precioMayorista < 0
      ) {
        throw errorDeValidacion(
          'Los precios deben ser números válidos y no negativos'
        )
      }

      if (precio <= precioMayorista) {
        throw errorDeValidacion(
          'El precio de venta debe ser mayor al precio mayorista'
        )
      }

      if (
        image !== undefined &&
        image !== null &&
        typeof image !== 'string'
      ) {
        throw errorDeValidacion(
          'La imagen del producto no es válida'
        )
      }

      conexion = await pool.getConnection()
      await conexion.beginTransaction()

      const categoriaId = await resolverCategoria(
        conexion,
        category
      )

      const proveedorId = await resolverProveedor(
        conexion,
        proveedor
      )

      const [resultado] = await conexion.query(
        `INSERT INTO Producto
          (
            Nombre_Producto,
            Imagen,
            Stock_Minimo,
            ubicacion,
            Categoria_idCategoria,
            Proveedor_idProveedor,
            price,
            wholesalePrice,
            profit
          )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          nombre,
          image || null,
          stockMinimo,
          ubicacion,
          categoriaId,
          proveedorId,
          precio,
          precioMayorista,
          precio - precioMayorista
        ]
      )

      if (stockInicial > 0) {
        await conexion.query(
          `INSERT INTO Movimiento_Inventario
            (
              Tipo_Movimiento,
              Cantidad_Movimiento,
              Usuarios_idUsuarios,
              Producto_idProducto
            )
           VALUES ('Entrada', ?, ?, ?)`,
          [
            stockInicial,
            obtenerUsuarioId(req.usuario),
            resultado.insertId
          ]
        )
      }

      await conexion.commit()

      res.status(201).json({
        id: resultado.insertId,
        message: 'Producto creado'
      })
    } catch (error) {
      if (conexion) {
        try {
          await conexion.rollback()
        } catch (errorRollback) {
          console.error(
            'Error revirtiendo creación de producto:',
            errorRollback
          )
        }
      }

      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          message:
            'Ya existe un producto con ese nombre'
        })
      }

      console.error(
        'Error creando producto:',
        error
      )

      res.status(error.statusCode || 500).json({
        message: error.statusCode
          ? error.message
          : 'Error al crear producto'
      })
    } finally {
      conexion?.release()
    }
  }
)

// COMPRAR VARIOS PRODUCTOS EN UNA SOLA TRANSACCIÓN (checkout del carrito)

/**
 * @swagger
 * /api/productos/comprar-lote:
 *   post:
 *     summary: Confirmar la compra de un carrito completo
 *     description: >
 *       Procesa la venta de uno o más productos en una única transacción de base de datos:
 *       bloquea las filas de Producto involucradas (en orden ascendente de id, para evitar
 *       deadlocks entre compras concurrentes), valida el stock disponible de cada producto y,
 *       si CUALQUIERA de los ítems falla (producto inexistente o stock insuficiente), revierte
 *       el lote completo — no queda ningún movimiento aplicado a medias.
 *     tags:
 *       - Productos
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - items
 *               - metodoPago
 *             properties:
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required:
 *                     - productoId
 *                     - cantidad
 *                   properties:
 *                     productoId:
 *                       type: integer
 *                       example: 10
 *                     cantidad:
 *                       type: integer
 *                       description: Entero mayor que cero
 *                       example: 3
 *               metodoPago:
 *                 type: string
 *                 enum:
 *                   - Efectivo
 *                   - Nequi
 *                   - Daviplata
 *                   - Tarjeta Débito
 *                   - Tarjeta Crédito
 *                   - Transferencia
 *                 example: Efectivo
 *     responses:
 *       200:
 *         description: Compra registrada correctamente (todos los ítems se aplicaron)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Compra registrada
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       productoId:
 *                         type: integer
 *                         example: 10
 *                       nombre:
 *                         type: string
 *                         example: Martillo
 *                       cantidad:
 *                         type: integer
 *                         example: 3
 *       400:
 *         description: El método de pago no es válido, el carrito está vacío o alguna cantidad no es un entero mayor que cero
 *       401:
 *         description: Token no proporcionado o inválido
 *       404:
 *         description: Alguno de los productos del carrito no existe (no se aplica ningún ítem del lote)
 *       409:
 *         description: Stock insuficiente para alguno de los productos (no se aplica ningún ítem del lote)
 *       500:
 *         description: Error al registrar la compra
 */
router.post(
  '/comprar-lote',
  verificarToken,
  async (req, res) => {
    let conexion

    try {
      const { items, metodoPago } = req.body

      if (!METODOS_PAGO.has(metodoPago)) {
        throw errorDeValidacion(
          'El método de pago no es válido'
        )
      }

      if (
        !Array.isArray(items) ||
        items.length === 0
      ) {
        throw errorDeValidacion(
          'El carrito no puede estar vacío'
        )
      }

      const itemsNormalizados = items.map(
        (item) => {
          const productoId = obtenerIdProducto(
            item.productoId
          )
          const cantidad = convertirEntero(
            item.cantidad
          )

          if (!cantidad || cantidad < 1) {
            throw errorDeValidacion(
              'La cantidad de cada producto debe ser un entero mayor que cero'
            )
          }

          return { productoId, cantidad }
        }
      )

      // Se bloquean las filas de Producto siempre en el mismo orden (por id
      // ascendente) para que, si dos compras concurrentes comparten un
      // producto, ambas transacciones pidan los bloqueos en el mismo orden
      // y MySQL nunca termine en deadlock.
      const itemsOrdenados = [
        ...itemsNormalizados
      ].sort(
        (a, b) => a.productoId - b.productoId
      )

      const usuarioId = obtenerUsuarioId(
        req.usuario
      )

      conexion = await pool.getConnection()
      await conexion.beginTransaction()

      const resumen = []

      for (const item of itemsOrdenados) {
        const [productos] = await conexion.query(
          `SELECT idProducto, Nombre_Producto
           FROM Producto
           WHERE idProducto = ?
           FOR UPDATE`,
          [item.productoId]
        )

        if (productos.length === 0) {
          throw errorDeValidacion(
            `El producto con id ${item.productoId} no existe`,
            404
          )
        }

        const stockActual = await obtenerStock(
          conexion,
          item.productoId
        )

        if (item.cantidad > stockActual) {
          throw errorDeValidacion(
            `Stock insuficiente para "${productos[0].Nombre_Producto}". Disponible: ${stockActual}`,
            409
          )
        }

        await conexion.query(
          `INSERT INTO Movimiento_Inventario
            (
              Tipo_Movimiento,
              Cantidad_Movimiento,
              Metodo_Pago,
              Usuarios_idUsuarios,
              Producto_idProducto
            )
           VALUES ('Salida', ?, ?, ?, ?)`,
          [
            item.cantidad,
            metodoPago,
            usuarioId,
            item.productoId
          ]
        )

        resumen.push({
          productoId: item.productoId,
          nombre: productos[0].Nombre_Producto,
          cantidad: item.cantidad
        })
      }

      // Si CUALQUIER producto del carrito falló arriba, ninguno de los
      // INSERT anteriores llega a confirmarse: se revierte todo el lote.
      await conexion.commit()

      res.json({
        message: 'Compra registrada',
        items: resumen
      })
    } catch (error) {
      if (conexion) {
        try {
          await conexion.rollback()
        } catch (errorRollback) {
          console.error(
            'Error revirtiendo compra por lote:',
            errorRollback
          )
        }
      }

      console.error(
        'Error registrando compra por lote:',
        error
      )

      res.status(error.statusCode || 500).json({
        message: error.statusCode
          ? error.message
          : 'Error al registrar la compra'
      })
    } finally {
      conexion?.release()
    }
  }
)

// COMPRAR STOCK A UN PROVEEDOR (entrada con costo real registrado)
// A diferencia de la vieja lógica de "stockNuevo" del PUT /:id, aquí SÍ
// se guarda cuánto costó realmente cada unidad, para que el reporte de
// ganancias/pérdidas sea exacto y no un estimado.

/**
 * @swagger
 * /api/productos/comprar-proveedor:
 *   post:
 *     summary: Registrar una compra de stock a un proveedor
 *     description: >
 *       Registra la reposición de stock de uno o más productos de un mismo proveedor,
 *       guardando el costo unitario realmente pagado en cada uno (no necesariamente el
 *       precio mayorista actual del producto). Procesa todo en una única transacción:
 *       si algún producto no existe o no pertenece al proveedor indicado, se revierte
 *       el lote completo. Solo disponible para administradores.
 *     tags:
 *       - Productos
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - proveedorId
 *               - items
 *             properties:
 *               proveedorId:
 *                 type: integer
 *                 example: 3
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required:
 *                     - productoId
 *                     - cantidad
 *                     - costoUnitario
 *                   properties:
 *                     productoId:
 *                       type: integer
 *                       example: 10
 *                     cantidad:
 *                       type: integer
 *                       description: Entero mayor que cero
 *                       example: 20
 *                     costoUnitario:
 *                       type: number
 *                       format: float
 *                       description: Costo real pagado por unidad (puede diferir del precio mayorista actual del producto)
 *                       example: 18000
 *               metodoPago:
 *                 type: string
 *                 nullable: true
 *                 enum:
 *                   - Efectivo
 *                   - Nequi
 *                   - Daviplata
 *                   - Tarjeta Débito
 *                   - Tarjeta Crédito
 *                   - Transferencia
 *                 example: Transferencia
 *     responses:
 *       200:
 *         description: Compra a proveedor registrada correctamente (todos los ítems se aplicaron)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Compra a proveedor registrada
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       productoId:
 *                         type: integer
 *                         example: 10
 *                       nombre:
 *                         type: string
 *                         example: Martillo
 *                       cantidad:
 *                         type: integer
 *                         example: 20
 *                       costoUnitario:
 *                         type: number
 *                         example: 18000
 *       400:
 *         description: >
 *           El proveedor no es válido, la lista de productos está vacía, o alguna
 *           cantidad/costo no es válido
 *       401:
 *         description: Token no proporcionado o inválido
 *       403:
 *         description: El usuario no tiene permisos de administrador
 *       404:
 *         description: >
 *           Alguno de los productos no existe o no pertenece al proveedor indicado
 *           (no se aplica ningún ítem del lote)
 *       500:
 *         description: Error al registrar la compra a proveedor
 */
router.post(
  '/comprar-proveedor',
  verificarToken,
  soloAdmin,
  async (req, res) => {
    let conexion

    try {
      const proveedorId = convertirEntero(
        req.body.proveedorId
      )

      if (!proveedorId || proveedorId < 1) {
        throw errorDeValidacion(
          'El proveedor no es válido'
        )
      }

      const { items, metodoPago } = req.body

      if (
        metodoPago &&
        !METODOS_PAGO.has(metodoPago)
      ) {
        throw errorDeValidacion(
          'El método de pago no es válido'
        )
      }

      if (
        !Array.isArray(items) ||
        items.length === 0
      ) {
        throw errorDeValidacion(
          'Debes seleccionar al menos un producto'
        )
      }

      const itemsNormalizados = items.map(
        (item) => {
          const productoId = obtenerIdProducto(
            item.productoId
          )
          const cantidad = convertirEntero(
            item.cantidad
          )
          const costoUnitario = convertirDecimal(
            item.costoUnitario
          )

          if (!cantidad || cantidad < 1) {
            throw errorDeValidacion(
              'La cantidad de cada producto debe ser un entero mayor que cero'
            )
          }

          if (
            costoUnitario === null ||
            costoUnitario < 0
          ) {
            throw errorDeValidacion(
              'El costo unitario de cada producto debe ser un número mayor o igual a cero'
            )
          }

          return {
            productoId,
            cantidad,
            costoUnitario
          }
        }
      )

      // Mismo criterio que en comprar-lote: se bloquean las filas de
      // Producto siempre en el mismo orden (por id ascendente) para
      // evitar deadlocks entre compras concurrentes.
      const itemsOrdenados = [
        ...itemsNormalizados
      ].sort(
        (a, b) => a.productoId - b.productoId
      )

      const usuarioId = obtenerUsuarioId(
        req.usuario
      )

      conexion = await pool.getConnection()
      await conexion.beginTransaction()

      const resumen = []

      for (const item of itemsOrdenados) {
        const [productos] = await conexion.query(
          `SELECT idProducto, Nombre_Producto, Proveedor_idProveedor
           FROM Producto
           WHERE idProducto = ?
           FOR UPDATE`,
          [item.productoId]
        )

        if (productos.length === 0) {
          throw errorDeValidacion(
            `El producto con id ${item.productoId} no existe`,
            404
          )
        }

        if (
          productos[0].Proveedor_idProveedor !==
          proveedorId
        ) {
          throw errorDeValidacion(
            `"${productos[0].Nombre_Producto}" no pertenece al proveedor seleccionado`,
            404
          )
        }

        await conexion.query(
          `INSERT INTO Movimiento_Inventario
            (
              Tipo_Movimiento,
              Cantidad_Movimiento,
              Costo_Unitario,
              Metodo_Pago,
              Usuarios_idUsuarios,
              Producto_idProducto
            )
           VALUES ('Entrada', ?, ?, ?, ?, ?)`,
          [
            item.cantidad,
            item.costoUnitario,
            metodoPago || null,
            usuarioId,
            item.productoId
          ]
        )

        resumen.push({
          productoId: item.productoId,
          nombre: productos[0].Nombre_Producto,
          cantidad: item.cantidad,
          costoUnitario: item.costoUnitario
        })
      }

      // Si CUALQUIER producto del lote falló arriba, ninguno de los
      // INSERT anteriores llega a confirmarse: se revierte todo el lote.
      await conexion.commit()

      res.json({
        message: 'Compra a proveedor registrada',
        items: resumen
      })
    } catch (error) {
      if (conexion) {
        try {
          await conexion.rollback()
        } catch (errorRollback) {
          console.error(
            'Error revirtiendo compra a proveedor:',
            errorRollback
          )
        }
      }

      console.error(
        'Error registrando compra a proveedor:',
        error
      )

      res.status(error.statusCode || 500).json({
        message: error.statusCode
          ? error.message
          : 'Error al registrar la compra a proveedor'
      })
    } finally {
      conexion?.release()
    }
  }
)

// ACTUALIZAR DATOS DEL PRODUCTO

/**
 * @swagger
 * /api/productos/{id}:
 *   put:
 *     summary: Actualizar un producto
 *     description: >
 *       Actualiza los datos de un producto existente. No maneja stock: la entrada
 *       de stock (reposición) se hace en /api/productos/comprar-proveedor, y la
 *       salida (venta) en /api/productos/comprar-lote. Ambos son transaccionales
 *       y registran el movimiento correspondiente. Solo disponible para administradores.
 *     tags:
 *       - Productos
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del producto que se desea actualizar
 *         example: 10
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Martillo
 *               image:
 *                 type: string
 *                 nullable: true
 *                 example: martillo.jpg
 *               minStock:
 *                 type: integer
 *                 example: 10
 *               currentLocation:
 *                 type: string
 *                 example: Estante 2
 *               category:
 *                 type: string
 *                 example: Herramientas
 *               mainSupplier:
 *                 type: string
 *                 example: Proveedor ABC
 *               price:
 *                 type: number
 *                 format: float
 *                 example: 25000
 *               wholesalePrice:
 *                 type: number
 *                 format: float
 *                 example: 20000
 *     responses:
 *       200:
 *         description: Producto actualizado correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Producto actualizado
 *       400:
 *         description: El identificador no es válido, no hay cambios que aplicar, o los datos enviados no son válidos
 *       401:
 *         description: Token no proporcionado o inválido
 *       403:
 *         description: Solo un administrador puede editar los datos del producto
 *       404:
 *         description: El producto no existe
 *       409:
 *         description: Ya existe un producto con ese nombre
 *       500:
 *         description: Error al actualizar producto
 */
router.put(
  '/:id',
  verificarToken,
  async (req, res) => {
    let conexion

    try {
      const productoId = obtenerIdProducto(
        req.params.id
      )

      const esAdministrador =
        req.usuario?.role === 'Administrador'

      const camposProducto = [
        'name',
        'image',
        'minStock',
        'currentLocation',
        'category',
        'mainSupplier',
        'price',
        'wholesalePrice'
      ]

      const solicitaActualizacionProducto =
        esAdministrador &&
        camposProducto.some((campo) =>
          Object.prototype.hasOwnProperty.call(
            req.body,
            campo
          )
        )

      if (!esAdministrador) {
        return res.status(403).json({
          message:
            'Solo un administrador puede editar los datos del producto'
        })
      }

      if (!solicitaActualizacionProducto) {
        throw errorDeValidacion(
          'No hay cambios para aplicar al producto'
        )
      }

      conexion = await pool.getConnection()
      await conexion.beginTransaction()

      const [productos] = await conexion.query(
        `SELECT
           idProducto,
           Nombre_Producto,
           Imagen,
           Stock_Minimo,
           ubicacion,
           Categoria_idCategoria,
           Proveedor_idProveedor,
           price,
           wholesalePrice
         FROM Producto
         WHERE idProducto = ?
         FOR UPDATE`,
        [productoId]
      )

      if (productos.length === 0) {
        throw errorDeValidacion(
          'El producto no existe',
          404
        )
      }

      const productoActual = productos[0]

      if (solicitaActualizacionProducto) {
        const nombre =
          Object.prototype.hasOwnProperty.call(
            req.body,
            'name'
          )
            ? String(req.body.name || '').trim()
            : productoActual.Nombre_Producto

        const ubicacion =
          Object.prototype.hasOwnProperty.call(
            req.body,
            'currentLocation'
          )
            ? String(
                req.body.currentLocation || ''
              ).trim()
            : productoActual.ubicacion || ''

        if (!nombre) {
          throw errorDeValidacion(
            'El nombre es obligatorio'
          )
        }

        if (nombre.length > 50) {
          throw errorDeValidacion(
            'El nombre no puede superar los 50 caracteres'
          )
        }

        if (ubicacion.length > 50) {
          throw errorDeValidacion(
            'La ubicación no puede superar los 50 caracteres'
          )
        }

        const stockMinimo =
          Object.prototype.hasOwnProperty.call(
            req.body,
            'minStock'
          )
            ? convertirEntero(
                req.body.minStock,
                0
              )
            : Number(
                productoActual.Stock_Minimo
              ) || 0

        const precio =
          Object.prototype.hasOwnProperty.call(
            req.body,
            'price'
          )
            ? convertirDecimal(req.body.price)
            : Number(productoActual.price)

        const precioMayorista =
          Object.prototype.hasOwnProperty.call(
            req.body,
            'wholesalePrice'
          )
            ? convertirDecimal(
                req.body.wholesalePrice
              )
            : Number(
                productoActual.wholesalePrice
              )

        if (
          stockMinimo === null ||
          stockMinimo < 0
        ) {
          throw errorDeValidacion(
            'El stock mínimo debe ser un entero igual o mayor que cero'
          )
        }

        if (
          precio === null ||
          precio < 0 ||
          precioMayorista === null ||
          precioMayorista < 0
        ) {
          throw errorDeValidacion(
            'Los precios deben ser números válidos y no negativos'
          )
        }

        if (precio <= precioMayorista) {
          throw errorDeValidacion(
            'El precio de venta debe ser mayor al precio mayorista'
          )
        }

        let imagen = productoActual.Imagen

        if (
          Object.prototype.hasOwnProperty.call(
            req.body,
            'image'
          )
        ) {
          if (
            req.body.image !== null &&
            typeof req.body.image !== 'string'
          ) {
            throw errorDeValidacion(
              'La imagen del producto no es válida'
            )
          }

          imagen = req.body.image || null
        }

        const categoriaId =
          Object.prototype.hasOwnProperty.call(
            req.body,
            'category'
          )
            ? await resolverCategoria(
                conexion,
                req.body.category
              )
            : productoActual.Categoria_idCategoria

        const proveedorId =
          Object.prototype.hasOwnProperty.call(
            req.body,
            'mainSupplier'
          )
            ? await resolverProveedor(
                conexion,
                req.body.mainSupplier
              )
            : productoActual.Proveedor_idProveedor

        await conexion.query(
          `UPDATE Producto
           SET
             Nombre_Producto = ?,
             Imagen = ?,
             Stock_Minimo = ?,
             ubicacion = ?,
             Categoria_idCategoria = ?,
             Proveedor_idProveedor = ?,
             price = ?,
             wholesalePrice = ?,
             profit = ?
           WHERE idProducto = ?`,
          [
            nombre,
            imagen,
            stockMinimo,
            ubicacion,
            categoriaId,
            proveedorId,
            precio,
            precioMayorista,
            precio - precioMayorista,
            productoId
          ]
        )
      }

      await conexion.commit()

      res.json({
        message: 'Producto actualizado'
      })
    } catch (error) {
      if (conexion) {
        try {
          await conexion.rollback()
        } catch (errorRollback) {
          console.error(
            'Error revirtiendo actualización de producto:',
            errorRollback
          )
        }
      }

      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          message:
            'Ya existe un producto con ese nombre'
        })
      }

      console.error(
        'Error actualizando producto:',
        error
      )

      res.status(error.statusCode || 500).json({
        message: error.statusCode
          ? error.message
          : 'Error al actualizar producto'
      })
    } finally {
      conexion?.release()
    }
  }
)

// ELIMINAR PRODUCTO

/**
 * @swagger
 * /api/productos/{id}:
 *   delete:
 *     summary: Eliminar un producto
 *     description: Elimina permanentemente un producto del inventario. Solo disponible para administradores.
 *     tags:
 *       - Productos
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del producto que se desea eliminar
 *         example: 10
 *     responses:
 *       200:
 *         description: Producto eliminado correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Producto eliminado
 *       400:
 *         description: El identificador del producto no es válido
 *       401:
 *         description: Token no proporcionado o inválido
 *       403:
 *         description: El usuario no tiene permisos de administrador
 *       404:
 *         description: El producto no existe
 *       500:
 *         description: Error al eliminar producto
 */
router.delete(
  '/:id',
  verificarToken,
  soloAdmin,
  async (req, res) => {
    try {
      const productoId = obtenerIdProducto(
        req.params.id
      )

      // Borrado suave: no eliminamos físicamente para no perder el
      // historial de movimientos (compras/ventas) asociado al producto.
      const [resultado] = await pool.query(
        'UPDATE Producto SET Activo = 0 WHERE idProducto = ? AND Activo = 1',
        [productoId]
      )

      if (resultado.affectedRows === 0) {
        return res.status(404).json({
          message: 'El producto no existe'
        })
      }

      res.json({
        message: 'Producto eliminado'
      })
    } catch (error) {
      console.error(
        'Error eliminando producto:',
        error
      )

      res.status(error.statusCode || 500).json({
        message: error.statusCode
          ? error.message
          : 'Error al eliminar producto'
      })
    }
  }
)

export default router