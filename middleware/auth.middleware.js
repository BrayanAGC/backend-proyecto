import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'

dotenv.config()

export const verificarToken = (req, res, next) => {
  const authHeader = req.headers.authorization

  if (!authHeader) {
    return res.status(401).json({
      message: 'Token requerido'
    })
  }

  const [tipo, token] = authHeader.split(' ')

  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({
      message: 'Formato de token inválido'
    })
  }

  if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET no está configurado')

    return res.status(500).json({
      message: 'Error de configuración del servidor'
    })
  }

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET
    )

    req.usuario = payload

    next()
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        message: 'Token expirado'
      })
    }

    return res.status(401).json({
      message: 'Token inválido'
    })
  }
}

export const soloAdmin = (req, res, next) => {
  if (req.usuario?.role !== 'Administrador') {
    return res.status(403).json({
      message: 'Acceso denegado'
    })
  }

  next()
}