import * as tf from '@tensorflow/tfjs'
import * as faceapi from 'face-api.js'

let modelsLoaded = false
let loadPromise: Promise<void> | null = null

export async function loadEmotionModels(): Promise<void> {
  if (modelsLoaded) return
  loadPromise = loadPromise ?? (async () => {
    try {
      // Ensure TFJS is ready
      await tf.ready()
      // Load tiny face detector and expression recognition models from CDN
      const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models'
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL)
      await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
      modelsLoaded = true
    } catch (err) {
      console.warn('Failed to load face-api models:', err)
    }
  })()
  await loadPromise
}

export async function detectUserEmotion(videoElement: HTMLVideoElement): Promise<string | null> {
  await loadEmotionModels()
  try {
    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
    const result = await faceapi.detectSingleFace(videoElement, options).withFaceExpressions()
    if (!result || !result.expressions) return null

    // Find highest scoring expression
    const expressions = result.expressions
    let highestExpression = 'neutral'
    let highestValue = 0

    for (const [expr, val] of Object.entries(expressions)) {
      if (val > highestValue) {
        highestValue = val
        highestExpression = expr
      }
    }

    return highestExpression
  } catch (err) {
    console.warn('Error detecting emotion:', err)
    return null
  }
}
