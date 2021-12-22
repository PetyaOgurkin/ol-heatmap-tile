import { toLonLat } from "ol/proj";
import DataTile from "ol/source/DataTile";
import WebGLTile from "ol/layer/WebGLTile";
import { colorScale } from "./colorScale";

export class HeatmapTile extends WebGLTile {
    constructor({
        data,
        dataBbox,
        url,
        renderBbox,
        tileGrid,
        projection,
        compression,
        colorSchema,
        ...options
    }) {

        super({ ...options, visible: false });

        this.tileGrid = tileGrid || null;
        this.projection = projection || "EPSG:3857";
        this.colorSchema = colorSchema || [
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
        this.compression = compression || 4
        this.size = 256
        this.dataBbox = dataBbox || [-180, -90, 180, 90];
        this.renderBbox = renderBbox || this.dataBbox;

        if (data) {
            this.setData(data)
        } else if (url) {
            this.setUrl(url)
        }
    }

    setColorSchema(colorSchema) {
        this.colorSchema = colorSchema
        this.colors = colorScale(colorSchema)
    }

    setDataBbox(bbox) {
        this.dataBbox = bbox
        this.setRenderBbox(bbox)
        this._updatePart()
    }

    setRenderBbox(bbox) {
        this.renderBbox = bbox
    }

    setTileGrid(tileGrid) {
        this.tileGrid = tileGrid
        if (this.source) {
            this.source.setTileGrid(tileGrid)
        }
    }

    setProjection(projection) {
        this.projection = projection
        if (this.source) {
            this.source.setProjection(projection)
        }
    }

    setData(data) {
        this.grid = data.grid;
        this.width = data.width;
        this._updatePart()
        this._renderTiles()
    }

    setUrl(url) {
        this.url = url;
        this._imgToArray(url).then(data => {
            this.setData(data)
        })
    }

    _updatePart() {
        if (this.width && this.dataBbox) {
            this.part = Math.round(this.width / Math.abs(this.dataBbox[2] - this.dataBbox[0]))
        }
    }

    async _imgToArray(src) {
        return new Promise((resolve, reject) => {
            const img = new Image()
            img.onload = () => {
                const canvasPic = document.createElement("canvas");
                const ctxPic = canvasPic.getContext("2d");
                canvasPic.width = img.width;
                canvasPic.height = img.height;
                ctxPic.drawImage(img, 0, 0);

                const imageData = ctxPic.getImageData(0, 0, img.width, img.height).data;
                canvasPic.style.display = "none";

                const imageArray = new Uint8Array(imageData.length / 4);
                for (let i = 0; i < imageData.length; i += 4) {
                    imageArray[i / 4] = imageData[i];
                }
                return resolve({ grid: imageArray, width: img.width })
            }
            img.onerror = reject
            img.src = src
            img.crossOrigin = "anonymous";
        })
    }


    _renderTiles() {
        if (this.getSource()) {
            // clear tiles cache and refresh source with new data
            this.getRenderer().tileTextureCache_.clear()
            this.changed()
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

    _getLoader() {
        const canvas = document.createElement("canvas");
        canvas.width = this.size;
        canvas.height = this.size;
        const context = canvas.getContext("2d");

        const half = this.compression / 2;

        const bboxConditionFunc = this._getBboxConditionFunc()

        return (z, x, y) => {

            const tileGrid = this.getSource().getTileGrid();
            const tileGridOrigin = tileGrid.getOrigin(z);
            const tileSizeAtResolution = tileGrid.getTileSize(z) * tileGrid.getResolution(z);

            const bbox = [
                tileGridOrigin[0] + tileSizeAtResolution * x,
                tileGridOrigin[1] + tileSizeAtResolution * (-y - 1),
                tileGridOrigin[0] + tileSizeAtResolution * (x + 1),
                tileGridOrigin[1] + tileSizeAtResolution * -y,
            ];

            context.clearRect(0, 0, this.size, this.size);
            const step = (bbox[2] - bbox[0]) / this.size;

            for (let i = 0; i <= this.size; i += this.compression) {
                for (let j = 0; j <= this.size; j += this.compression) {
                    const point = toLonLat([bbox[0] + step * (i + half), bbox[1] + step * (j + half)], this.projection);
                    if (bboxConditionFunc(...point)) {
                        context.fillStyle = this.colors(this._getGridValue(...point));
                        context.fillRect(
                            i - half,
                            this.size - j - half,
                            this.compression,
                            this.compression
                        );
                    }
                }
            }

            return Promise.resolve(new Uint8Array(context.getImageData(0, 0, this.size, this.size).data.buffer));
        }
    }

    _getBboxConditionFunc() {
        if (this.renderBbox[2] < this.renderBbox[0]) {
            return (lon, lat) =>
                (lon >= this.renderBbox[0] && lat >= this.renderBbox[1] && lat <= this.renderBbox[3]) ||
                (lon >= -180 && lon <= this.renderBbox[2] && lat >= this.renderBbox[1] && lat <= this.renderBbox[3])
        }
        return (lon, lat) => lon >= this.renderBbox[0] && lon <= this.renderBbox[2] && lat >= this.renderBbox[1] && lat <= this.renderBbox[3]
    }

    _getGridValue(lon, lat) {
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