import babel from '@rollup/plugin-babel'
import commonjs from '@rollup/plugin-commonjs'
import replace from '@rollup/plugin-replace'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import { terser } from 'rollup-plugin-terser'

const env = process.env.NODE_ENV
const extensions = ['.js', '.ts']

const config = {
    input: 'src/index.ts',
    output: {
        file:
            env === 'production'
                ? 'umd/ol-heatmap-tile.min.js'
                : 'umd/ol-heatmap-tile.js',
        format: 'umd',
        globals: {
            'ol': 'ol',
            'ol/proj': 'ol.proj',
            'ol/source/DataTile': 'ol.source.DataTile',
            'ol/layer/WebGLTile': 'ol.layer.WebGLTile',
            'ol/tilegrid/TileGrid': 'ol.tilegrid.TileGrid'
        },
        name: 'HeatmapTile',
    },
    external: ['ol', 'ol/proj', 'ol/source/DataTile', 'ol/layer/WebGLTile', 'ol/tilegrid/TileGrid'],
    plugins: [
        nodeResolve({
            browser: true,
            extensions,
        }),
        commonjs(),
        babel({
            exclude: '**/node_modules/**',
            extensions,
            babelHelpers: 'bundled',
        }),
        replace({
            preventAssignment: true,
            'process.env.NODE_ENV': JSON.stringify(env),
        }),
    ],
}

if (env === 'production') {
    config.plugins.push(terser())
}

export default config