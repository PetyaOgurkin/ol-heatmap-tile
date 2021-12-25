import { Projection, toLonLat } from "ol/proj";
import DataTile from "ol/source/DataTile";
import WebGLTile from "ol/layer/WebGLTile";
import { colorScale, ColorSchema } from "./colorScale";
import TileGrid from "ol/tilegrid/TileGrid";


type Grid = Int8Array | Uint8Array | Uint8ClampedArray | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array

type Data = {
    readonly grid: Grid
    readonly width: number
}

type Bbox = [number, number, number, number]

interface Options {
    readonly data?: Data
    readonly dataBbox?: Bbox
    readonly url?: string
    readonly renderBbox?: Bbox
    readonly tileGrid?: TileGrid
    readonly projection?: string | Projection
    readonly compression?: number
    readonly colorSchema?: ColorSchema[]
    readonly renderValues?: boolean
    readonly valueMiniMaxes?: [number, number]
    readonly valueRoundDigits?: number
    readonly valuesFont?: string
    readonly valuesColor?: string
    readonly olOptions: object    // WebGLTile options
}


export class HeatmapTile extends WebGLTile {

    private tileGrid: TileGrid | undefined
    private projection: string | Projection
    private colorSchema: ColorSchema[]
    private compression: number
    private dataBbox: Bbox
    private renderBbox: Bbox
    private url?: string
    private grid: Grid = new Uint8Array(0)
    private width: number = 0
    private part: number = 0
    private renderValues: boolean
    private valuesFont: string
    private valuesColor: string
    private valueMiniMaxes: [number, number]
    private valueRoundDigits: number
    private size: number = 256
    private colors: Function

    constructor(options: Options) {
        super({ ...options.olOptions, visible: false });

        this.renderValues = options.renderValues || false
        this.tileGrid = options.tileGrid || undefined;
        this.projection = options.projection || "EPSG:3857";
        this.colorSchema = options.colorSchema || [
            [0, '#CD0074'],
            [21, '#7209AB'],
            [43, '#3914B0'],
            [64, '#1240AC'],
            [106, '#009A9A'],
            [128, '#00CC00'],
            [149, '#9FEE00'],
            [170, '#FFFF00'],
            [191, '#FFD300'],
            [213, '#FFAA00'],
            [234, '#FF7400'],
            [255, '#FF0000']
        ]
        this.colors = colorScale(this.colorSchema)
        this.compression = options.compression || this.renderValues ? 64 : 4
        this.dataBbox = options.dataBbox || [-180, -90, 180, 90];
        this.renderBbox = options.renderBbox || this.dataBbox;

        this.valueMiniMaxes = options.valueMiniMaxes || [0, 255]
        this.valueRoundDigits = options.valueRoundDigits || 0
        this.valuesFont = options.valuesFont || '24px sans-serif'
        this.valuesColor = options.valuesColor || '#fff'

        if (options.data) {
            this.setData(options.data)
        } else if (options.url) {
            this.setUrl(options.url)
        }
    }

    setColorSchema(colorSchema: ColorSchema[]) {
        this.colorSchema = colorSchema
        this.colors = colorScale(colorSchema)
    }

    setDataBbox(bbox: Bbox) {
        this.dataBbox = bbox
        this.setRenderBbox(bbox)
        this._updatePart()
    }

    setRenderBbox(bbox: Bbox) {
        this.renderBbox = bbox
    }

    setTileGrid(tileGrid: TileGrid) {
        this.tileGrid = tileGrid
    }

    setProjection(projection: string) {
        this.projection = projection
    }

    setData(data: Data) {
        this.grid = data.grid;
        this.width = data.width;
        this._updatePart()
        this._renderTiles()
    }

    setUrl(url: string) {
        this.url = url;
        this._loadData()
    }

    setValuesFont(valuesFont: string) {
        this.valuesFont = valuesFont;
    }

    setValuesColor(valuesColor: string) {
        this.valuesColor = valuesColor;
    }

    setValueMiniMaxes(valueMiniMaxes: [number, number]) {
        this.valueMiniMaxes = valueMiniMaxes;
    }

    setValueRoundDigits(valueRoundDigits: number) {
        this.valueRoundDigits = valueRoundDigits;
    }

    getValueFromLonLat(lon: number, lat: number) {
        return this._scaleValue(this._getGridValue(lon, lat))
    }

    refresh() {
        // clear tileTextureCache_ by private field see https://github.com/openlayers/openlayers/issues/13051
        // @ts-ignore
        this.getRenderer().tileTextureCache_.clear()
        this.changed()
    }

    private _scaleValue(value: number) {
        return (value * (this.valueMiniMaxes[1] - this.valueMiniMaxes[0]) / 255 + this.valueMiniMaxes[0]).toFixed(this.valueRoundDigits)
    }

    private _updatePart() {
        if (this.width && this.dataBbox) {
            this.part = Math.round(this.width / Math.abs(this.dataBbox[2] - this.dataBbox[0]))
        }
    }

    private _loadData() {
        const img = new Image()
        img.onload = () => {
            const canvasPic = document.createElement("canvas");
            const ctxPic = canvasPic.getContext("2d");
            canvasPic.width = img.width;
            canvasPic.height = img.height;

            if (ctxPic) {
                ctxPic.drawImage(img, 0, 0);
                const imageData = ctxPic.getImageData(0, 0, img.width, img.height).data;
                canvasPic.style.display = "none";

                const imageArray = new Uint8Array(imageData.length / 4);
                for (let i = 0; i < imageData.length; i += 4) {
                    imageArray[i / 4] = imageData[i];
                }

                this.setData({ grid: imageArray, width: img.width })
            }
        }
        if (this.url) {
            img.src = this.url
        }
        img.crossOrigin = "anonymous";
    }

    private _renderTiles() {
        if (this.getSource()) {
            this.refresh()
        } else {
            const loader = this._getLoader();

            this.setSource(
                new DataTile({
                    loader,
                    projection: this.projection,
                    ...(this.tileGrid) && { tileGrid: this.tileGrid },
                    transition: 0
                })
            )
            this.setVisible(true)
        }
    }

    private _getLoader() {
        const canvas = document.createElement("canvas");
        canvas.width = this.size;
        canvas.height = this.size;
        const context = canvas.getContext("2d")!;
        context.font = this.valuesFont;
        context.fillStyle = this.valuesColor;

        const half = this.compression / 2;

        const bboxConditionFunc = this._getBboxConditionFunc()

        return (z: number, x: number, y: number) => {

            const tileGrid = this.getSource().getTileGrid();
            const tileGridOrigin = tileGrid.getOrigin(z);
            const tileSizeAtResolution = this.size * tileGrid.getResolution(z);
            const bbox = [
                tileGridOrigin[0] + tileSizeAtResolution * x,
                tileGridOrigin[1] + tileSizeAtResolution * (-y - 1),
                tileGridOrigin[0] + tileSizeAtResolution * (x + 1),
                tileGridOrigin[1] + tileSizeAtResolution * -y,
            ];

            context.clearRect(0, 0, this.size, this.size);
            const step = (bbox[2] - bbox[0]) / this.size;

            const pixelRenderFunc = this.renderValues ?
                (value: number, i: number, j: number) => context.fillText(this._scaleValue(value), i - half, this.size - j - half) :
                (value: number, i: number, j: number) => {
                    context.fillStyle = this.colors(value);
                    context.fillRect(
                        i - half,
                        this.size - j - half,
                        this.compression,
                        this.compression
                    );
                }

            for (let i = 0; i <= this.size; i += this.compression) {
                for (let j = 0; j <= this.size; j += this.compression) {
                    const point = toLonLat([bbox[0] + step * (i + half), bbox[1] + step * (j + half)], this.projection);
                    if (bboxConditionFunc(point[0], point[1])) {
                        const value = this._getGridValue(point[0], point[1])
                        pixelRenderFunc(value, i, j);
                    }
                }
            }
            return Promise.resolve(new Uint8Array(context.getImageData(0, 0, this.size, this.size).data.buffer));
        }
    }

    private _getBboxConditionFunc() {
        if (this.renderBbox[2] < this.renderBbox[0]) {
            return (lon: number, lat: number) =>
                (lon >= this.renderBbox[0] && lat >= this.renderBbox[1] && lat <= this.renderBbox[3]) ||
                (lon >= -180 && lon <= this.renderBbox[2] && lat >= this.renderBbox[1] && lat <= this.renderBbox[3])
        }
        return (lon: number, lat: number) => lon >= this.renderBbox[0] && lon <= this.renderBbox[2] && lat >= this.renderBbox[1] && lat <= this.renderBbox[3]
    }

    private _getGridValue(lon: number, lat: number) {
        const x = lat;
        const y = this.dataBbox[2] < this.dataBbox[0] && lon <= this.dataBbox[2] ? lon + 360 : lon;

        const x1 = Math.floor(x * this.part) / this.part
        const x2 = Math.ceil(x * this.part) / this.part
        const y1 = Math.floor(y * this.part) / this.part
        const y2 = Math.ceil(y * this.part) / this.part

        const q11 = this.grid[(this.dataBbox[3] - x1) * this.part * this.width + (y1 - this.dataBbox[0]) * this.part];
        const q12 = this.grid[(this.dataBbox[3] - x1) * this.part * this.width + (y2 - this.dataBbox[0]) * this.part];
        const q21 = this.grid[(this.dataBbox[3] - x2) * this.part * this.width + (y1 - this.dataBbox[0]) * this.part];
        const q22 = this.grid[(this.dataBbox[3] - x2) * this.part * this.width + (y2 - this.dataBbox[0]) * this.part];

        const d = ((x2 - x1) * (y2 - y1))
        return ((q11 * (x2 - x) * (y2 - y)) / d) + ((q21 * (x - x1) * (y2 - y)) / d) + ((q12 * (x2 - x) * (y - y1)) / d) + ((q22 * (x - x1) * (y - y1)) / d)
    }
}