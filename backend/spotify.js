const path = require('path')
const ENV_PATH = path.join(__dirname, '..', '.env')
require('dotenv').config({ path: ENV_PATH })
const SpotifyWebApi = require('spotify-web-api-node')
const http = require('http')
const fs   = require('fs')

const spotify = new SpotifyWebApi({
  clientId:     process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri:  process.env.SPOTIFY_REDIRECT_URI
})

async function refreshToken() {
  try {
    const data = await spotify.refreshAccessToken()
    spotify.setAccessToken(data.body.access_token)
    console.log('[SPOTIFY] Token refrescado')
  } catch (err) {
    console.error('[SPOTIFY] Error refrescando token:', err.message)
  }
}

if (process.env.SPOTIFY_REFRESH_TOKEN) {
  spotify.setRefreshToken(process.env.SPOTIFY_REFRESH_TOKEN)
  refreshToken().then(() => console.log('[SPOTIFY] Sesion restaurada automaticamente'))
}

setInterval(refreshToken, 50 * 60 * 1000)

function getAuthUrl() {
  const scopes = [
    'user-modify-playback-state',
    'user-read-playback-state',
    'user-read-currently-playing'
  ]
  return spotify.createAuthorizeURL(scopes, 'jarvis-state')
}

function startAuthServer() {
  return new Promise((resolve, reject) => {
    const authServer = http.createServer(async (req, res) => {
      const parsed = new URL(req.url, 'http://127.0.0.1:8888')
      if (parsed.pathname === '/callback' && parsed.searchParams.get('code')) {
        try {
          const code = parsed.searchParams.get('code')
          const data = await spotify.authorizationCodeGrant(code)
          spotify.setAccessToken(data.body.access_token)
          spotify.setRefreshToken(data.body.refresh_token)

          let envContent = fs.readFileSync(ENV_PATH, 'utf8')
          if (envContent.includes('SPOTIFY_REFRESH_TOKEN=')) {
            envContent = envContent.replace(/SPOTIFY_REFRESH_TOKEN=.*/, `SPOTIFY_REFRESH_TOKEN=${data.body.refresh_token}`)
          } else {
            envContent += `\nSPOTIFY_REFRESH_TOKEN=${data.body.refresh_token}`
          }
          fs.writeFileSync(ENV_PATH, envContent)
          console.log('[SPOTIFY] Refresh token guardado')

          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end('<h1 style="font-family:sans-serif;color:green">JARVIS conectado a Spotify!</h1><p>Puedes cerrar esta ventana.</p>')
          authServer.close()
          resolve()
        } catch (err) {
          reject(err)
        }
      }
    })
    authServer.listen(8888, '127.0.0.1')
  })
}

async function getActiveDevice() {
  try {
    const devices = await spotify.getMyDevices()
    const active = devices.body.devices.find(d => d.is_active)
    if (active) return active
    // Si no hay activo, usa el primero disponible
    if (devices.body.devices.length > 0) {
      const device = devices.body.devices[0]
      console.log('[SPOTIFY] Activando dispositivo:', device.name)
      await spotify.transferMyPlayback([device.id])
      await new Promise(r => setTimeout(r, 1500))
      return device
    }
    return null
  } catch (err) {
    console.error('[SPOTIFY] Error obteniendo dispositivos:', err.message)
    return null
  }
}

async function play(query) {
  try {
    console.log('[SPOTIFY] Intentando reproducir:', query || '(reanudar)')
    const device = await getActiveDevice()
    if (!device) return 'No Spotify device found. Please open Spotify on your PC.'

    if (query) {
      const result = await spotify.searchTracks(query, { limit: 1 })
      const track = result.body.tracks?.items?.[0]
      if (track) {
        console.log('[SPOTIFY] Cancion encontrada:', track.name, '-', track.uri)
        await spotify.play({ uris: [track.uri], device_id: device.id })
        return `Playing ${track.name} by ${track.artists[0].name}.`
      }
      return `Could not find "${query}" on Spotify.`
    }
    await spotify.play({ device_id: device.id })
    return 'Resuming playback.'
  } catch (err) {
    console.error('[SPOTIFY] Error en play:', err.statusCode, err.message)
    if (err.statusCode === 401) {
      await refreshToken()
      return 'Token refreshed, please try again.'
    }
    return `Spotify error: ${err.message}`
  }
}

async function pause() {
  try {
    await spotify.pause()
    return 'Paused.'
  } catch (err) {
    console.error('[SPOTIFY] Error en pause:', err.statusCode, err.message)
    return `Spotify error: ${err.message}`
  }
}

async function next() {
  try {
    await spotify.skipToNext()
    return 'Skipping to next track.'
  } catch (err) {
    console.error('[SPOTIFY] Error en next:', err.statusCode, err.message)
    return `Spotify error: ${err.message}`
  }
}

async function previous() {
  try {
    await spotify.skipToPrevious()
    return 'Going back to previous track.'
  } catch (err) {
    console.error('[SPOTIFY] Error en previous:', err.statusCode, err.message)
    return `Spotify error: ${err.message}`
  }
}

async function currentTrack() {
  try {
    const data = await spotify.getMyCurrentPlayingTrack()
    if (data.body?.item) {
      return `Currently playing ${data.body.item.name} by ${data.body.item.artists[0].name}.`
    }
    return 'Nothing is playing right now.'
  } catch (err) {
    console.error('[SPOTIFY] Error en currentTrack:', err.statusCode, err.message)
    return `Spotify error: ${err.message}`
  }
}

async function spotifyCommand(action, query) {
  console.log('[SPOTIFY] Ejecutando:', action, query || '')
  switch (action) {
    case 'play':    return await play(query)
    case 'pause':   return await pause()
    case 'next':    return await next()
    case 'prev':    return await previous()
    case 'current': return await currentTrack()
    default: return 'Unknown Spotify command.'
  }
}

module.exports = { spotifyCommand, getAuthUrl, startAuthServer, spotify }