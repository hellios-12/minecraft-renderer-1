/**
 * Three.js Graphics Backend - Main entry point for Three.js WebGL rendering.
 *
 * This module re-exports the single-thread graphics backend as the default.
 * For off-thread rendering, use graphicsBackendOffThread.ts instead.
 */

// Re-export the single-thread backend as default
export { default, createGraphicsBackendSingleThread } from './graphicsBackendSingleThread'

// Re-export shared types and utilities
export type { ThreeJsBackendMethods } from './graphicsBackendBase'
export { createGraphicsBackendBase, getBackendMethods, callModsMethod } from './graphicsBackendBase'
