import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
// 1. Importa Swagger
import swaggerUi from 'swagger-ui-express'
import swaggerJsdoc from 'swagger-jsdoc'

import authRoutes from './routes/auth.routes.js'
import usuariosRoutes from './routes/usuarios.routes.js'
import productosRoutes from './routes/productos.routes.js'
import categoriasRoutes from './routes/categorias.routes.js'
import proveedoresRoutes from './routes/proveedores.routes.js'
import movimientosRoutes from './routes/movimientos.routes.js'

dotenv.config()

const app = express()

// 2. Configuración básica de Swagger
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',

    info: {
      title: 'API de Inventario',
      version: '1.0.0',
      description: 'Documentación de las rutas de mi backend',
    },

    servers: [
      {
        url: 'http://localhost:4001',
      },
    ],

    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },

  apis: ['./routes/*.js'],
}

const swaggerSpecs = swaggerJsdoc(swaggerOptions)

const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:4000',
  'http://127.0.0.1:4000'
]

// En desarrollo, Flutter web usa un puerto aleatorio (localhost:XXXXX)
// que cambia en cada arranque, así que permitimos cualquier puerto local.
const esOrigenLocal = (origin) =>
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)

app.use(cors({
  origin: (origin, callback) => {
    // Peticiones sin origin (Postman, apps móviles, curl) o de la lista blanca
    if (!origin || allowedOrigins.includes(origin) || esOrigenLocal(origin)) {
      return callback(null, true)
    }
    callback(new Error('CORS policy: Origin not allowed'))
  }
}))
app.use(express.json())

// 3. Ruta para la documentación
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs))

// Tus rutas normales de la API
app.use('/api/movimientos', movimientosRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/usuarios', usuariosRoutes)
app.use('/api/productos', productosRoutes)
app.use('/api/categorias', categoriasRoutes)
app.use('/api/proveedores', proveedoresRoutes)

const PORT = process.env.PORT || 4000
app.listen(PORT, () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`)
})