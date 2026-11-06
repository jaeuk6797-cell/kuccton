import { isTree } from './tree.js'

// The preserved mixed-flora implementation uses crystal peonies for cozy flowers.
// This is a rendering choice only: source records, colors, categories and IDs stay intact.
export const isBlenderGardenFlower = (flower) => !isTree(flower) && flower.category === 'cozy'
