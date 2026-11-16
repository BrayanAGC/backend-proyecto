import swaggerJSDoc from 'swagger-jsdoc'

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API Ferretería Isabela',
      version: '1.0.0',
      description: 'API REST para el sistema de inventario de Ferretería Isabela'
    },
    servers: [
      {
        url: 'http://localhost:4000', //http://localhost:4000/api-docs
        description: 'Servidor local'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  },

  apis: ['./routes/*.js']
}

const swaggerSpec = swaggerJSDoc(options)

export default swaggerSpec