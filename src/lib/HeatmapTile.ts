import { Extent } from "ol/extent";
import WebGLTile, { Options } from "ol/layer/WebGLTile";
import { toLonLat, transform } from "ol/proj";
import DataTile from "ol/source/DataTile";
import TileGrid from "ol/tilegrid/TileGrid";

type Grid = Int8Array | Uint8Array | Uint8ClampedArray | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array;

type Data = {
  grid: Grid;
  width: number;
  height: number;
};

type Mode = "heatmap" | "matrix";

type ColorSchema = [number, string][];

export interface HeatmapTileOptions {
  data?: Data;
  dataBbox?: Extent;
  url?: string;
  renderBbox?: Extent;
  tileGrid?: TileGrid;
  projection?: string;
  dataProjection?: string;
  colorSchema?: ColorSchema;
  mode?: Mode;
  dataExtremes?: [number, number];
  valueRoundDigits?: number;
  fontFamily?: string;
  fontSize?: string;
  fontColor?: string;
  compression?: number;
  webGLTileProps?: Options;
}

export default class HeatmapTile extends WebGLTile {
  private tileGrid: TileGrid | undefined;
  private projection: string;
  private dataProjection: string;
  private colorSchema: (string | number)[];
  private dataBbox: Extent;
  private renderBbox: Extent;
  private url?: string;
  private grid: Grid = new Uint8Array(0);
  private width: number = 0;
  private height: number = 0;
  private part: number[] = [0, 0];
  private mode: Mode;
  private fontFamily: string;
  private fontSize: string;
  private fontColor: string;
  private dataExtremes: [number, number];
  private valueRoundDigits: number;
  private size: number = 256;
  private compression: number = 2;

  constructor(options: HeatmapTileOptions) {
    super({
      ...options.webGLTileProps,
      visible: false,
    });

    this.mode = options.mode || "heatmap";
    this.tileGrid = options.tileGrid || undefined;
    this.projection = options.projection || "EPSG:3857";
    this.dataProjection = options.dataProjection || "EPSG:4326";
    this.dataExtremes = options.dataExtremes || [-60, 50];
    this.compression = options.compression || 2;
    this.colorSchema = this._convertSchema(
      options.colorSchema || [
        [-40, "#E3E3E3"],
        [-30, "#F3A5F3"],
        [-20, "#8E108E"],
        [-15, "#291E6A"],
        [-10, "#5650AB"],
        [-5, "#4178BE"],
        [0, "#4FB296"],
        [5, "#5BC94C"],
        [10, "#B7DA40"],
        [15, "#E1CE39"],
        [20, "#E09F41"],
        [25, "#DB6C54"],
        [30, "#B73466"],
        [40, "#6B1527"],
        [50, "#2B0001"],
      ]
    );

    this.dataBbox = options.dataBbox || [-180, -90, 180, 90];
    this.renderBbox = options.renderBbox || this.dataBbox;

    this.valueRoundDigits = options.valueRoundDigits || 0;
    this.fontColor = options.fontColor || "#fff";
    this.fontFamily = options.fontFamily || window.getComputedStyle(document.querySelector("html")!, null).getPropertyValue("font-family");
    this.fontSize = options.fontSize || "1.2rem";

    this.setStyle(this._getStyle());

    if (options.data) {
      this._setData(options.data);
    } else if (options.url) {
      this._setUrl(options.url);
    }
  }

  updateProps({
    colorSchema,
    data,
    dataBbox,
    dataExtremes,
    dataProjection,
    fontFamily,
    fontSize,
    fontColor,
    mode,
    projection,
    renderBbox,
    tileGrid,
    url,
    valueRoundDigits,
    compression,
  }: HeatmapTileOptions) {
    if (mode) {
      this.mode = mode;
      this.setStyle(this._getStyle());
    }

    if (dataProjection) {
      this.dataProjection = dataProjection;
    }

    if (dataExtremes) {
      this.dataExtremes = dataExtremes;
    }

    if (colorSchema && this.mode === "heatmap") {
      this.colorSchema = this._convertSchema(colorSchema);
      this.setStyle(this._getStyle());
    }

    if (dataBbox) {
      this.dataBbox = dataBbox;
      this.renderBbox = dataBbox;
      this._updatePart();
    }

    if (renderBbox) {
      this.renderBbox = renderBbox;
    }

    if (tileGrid) {
      this.tileGrid = tileGrid;
    }

    if (projection) {
      this.projection = projection;
    }

    if (compression) {
      this.compression = compression;
    }

    if (valueRoundDigits) {
      this.valueRoundDigits = valueRoundDigits;
    }

    if (fontFamily) {
      this.fontFamily = fontFamily;
    }

    if (fontSize) {
      this.fontSize = fontSize;
    }

    if (fontColor) {
      this.fontColor = fontColor;
    }

    if (data) {
      return this._setData(data);
    }

    if (url) {
      return this._setUrl(url);
    }

    this._setSource();
  }

  getValueFromCoord(x: number, y: number) {
    const coord = transform([x, y], this.projection, this.dataProjection);
    return this._from255(this._getGridValue(coord[0], coord[1]));
  }

  getValueFromLonLat(lon: number, lat: number) {
    return this._from255(this._getGridValue(lon, lat));
  }

  private _getStyle() {
    if (this.mode === "matrix") return {};

    return {
      color: ["interpolate", ["linear"], ["+", ["band", 1], ["band", 4]], 0, "transparent", ...this.colorSchema],
    };
  }

  private _setData(data: Data) {
    this.grid = data.grid;
    this.width = data.width;
    this.height = data.height;
    this._updatePart();
    this._setSource();
  }

  private _setUrl(url: string) {
    this.url = url;
    this._loadData();
  }

  private _from255(value: number) {
    return ((value * (this.dataExtremes[1] - this.dataExtremes[0])) / 255 + this.dataExtremes[0]).toFixed(this.valueRoundDigits);
  }

  private _to255(value: number) {
    return ((value - this.dataExtremes[0]) * 255) / (this.dataExtremes[1] - this.dataExtremes[0]);
  }

  private _convertSchema(schema: ColorSchema): (string | number)[] {
    return schema.flatMap((e) => [1 + this._to255(e[0]) / 255, e[1]]);
  }

  private _updatePart() {
    if (this.height && this.width && this.dataBbox) {
      const dx =
        this.dataBbox[2] < this.dataBbox[0] ? 180 - this.dataBbox[0] + (180 + this.dataBbox[2]) : Math.abs(this.dataBbox[2] - this.dataBbox[0]);
      const dy = Math.abs(this.dataBbox[3] - this.dataBbox[1]);
      this.part = [dx / this.width, dy / this.height];
    }
  }

  private _loadData() {
    const img = new Image();
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

        this._setData({ grid: imageArray, width: img.width, height: img.height });
      }
    };
    if (this.url) {
      img.src = this.url;
    }
    img.crossOrigin = "anonymous";
  }

  private _setSource() {
    const loader = this.mode === "matrix" ? this._getMatrixLoader() : this._getHeatmapLoader();

    this.setSource(
      new DataTile({
        wrapX: true,
        loader,
        projection: this.projection,
        tileGrid: this.tileGrid,
        transition: 0,
        interpolate: true,
      })
    );

    this.setVisible(true);
  }

  private _getHeatmapLoader() {
    const half = this.compression / 2;

    const bboxConditionFunc = this._getBboxConditionFunc();
    const transformFunc = this._getTransformCoordFunc();

    return (z: number, x: number, y: number): Uint8Array => {
      const bbox = this._getBbox(z, x, y);
      const step = (bbox[2] - bbox[0]) / this.size;
      const arr = new Uint8Array(this.size * this.size * 4);

      for (let i = 0; i < this.size; i += this.compression) {
        for (let j = 0; j < this.size; j += this.compression) {
          const point = transformFunc(bbox[0] + step * (i + half), bbox[3] - step * (j + half));

          if (!bboxConditionFunc(point[0], point[1])) continue;

          const value = Math.round(this._getGridValue(point[0], point[1]));
          if (isNaN(value)) continue;

          for (let k = 0; k < this.compression; k++) {
            for (let l = 0; l < this.compression; l++) {
              arr[(j + k) * this.size * 4 + (i + l) * 4] = value;
              arr[(j + k) * this.size * 4 + (i + l) * 4 + 1] = value;
              arr[(j + k) * this.size * 4 + (i + l) * 4 + 2] = value;
              arr[(j + k) * this.size * 4 + (i + l) * 4 + 3] = 255;
            }
          }
        }
      }

      return arr;
    };
  }

  private _getMatrixLoader() {
    const canvas = document.createElement("canvas");
    canvas.width = this.size;
    canvas.height = this.size;
    const context = canvas.getContext("2d", {
      willReadFrequently: true,
    })!;
    context.font = `${this.fontSize} ${this.fontFamily}`;
    context.fillStyle = this.fontColor;
    const half = 32;

    const bboxConditionFunc = this._getBboxConditionFunc();
    const transformFunc = this._getTransformCoordFunc();
    return (z: number, x: number, y: number): Uint8Array => {
      const bbox = this._getBbox(z, x, y);

      context.clearRect(0, 0, this.size, this.size);
      const step = (bbox[2] - bbox[0]) / this.size;

      for (let i = 0; i <= this.size; i += 64) {
        for (let j = 0; j <= this.size; j += 64) {
          const point = transformFunc(bbox[0] + step * (i + half), bbox[1] + step * (j + half));
          if (!bboxConditionFunc(point[0], point[1])) continue;
          const value = this._getGridValue(point[0], point[1]);
          if (value || value === 0) {
            context.fillText(this._from255(value), i - half, this.size - j - half);
          }
        }
      }

      return new Uint8Array(context.getImageData(0, 0, this.size, this.size).data.buffer);
    };
  }

  private _getBbox(z: number, x: number, y: number) {
    const tileGrid = this.getSource()?.getTileGrid()!;
    const tileGridOrigin = tileGrid.getOrigin(z);
    const tileSizeAtResolution = this.size * tileGrid.getResolution(z);
    return [
      tileGridOrigin[0] + tileSizeAtResolution * x,
      tileGridOrigin[1] + tileSizeAtResolution * (-y - 1),
      tileGridOrigin[0] + tileSizeAtResolution * (x + 1),
      tileGridOrigin[1] + tileSizeAtResolution * -y,
    ];
  }

  private _getTransformCoordFunc() {
    if (this.projection === this.dataProjection) {
      return (x: number, y: number) => [x, y];
    }

    if (this.dataProjection === "EPSG:4326") {
      return (x: number, y: number) => toLonLat([x, y], this.projection);
    }

    return (x: number, y: number) => transform([x, y], this.projection, this.dataProjection);
  }

  private _getBboxConditionFunc() {
    if (this.renderBbox[2] < this.renderBbox[0]) {
      return (lon: number, lat: number) =>
        (lon >= this.renderBbox[0] && lat >= this.renderBbox[1] && lat <= this.renderBbox[3]) ||
        (lon >= -180 && lon <= this.renderBbox[2] && lat >= this.renderBbox[1] && lat <= this.renderBbox[3]);
    }
    return (lon: number, lat: number) =>
      lon >= this.renderBbox[0] && lon <= this.renderBbox[2] && lat >= this.renderBbox[1] && lat <= this.renderBbox[3];
  }

  private _getGridValue(lon: number, lat: number) {
    const x = this.dataBbox[2] < this.dataBbox[0] && lon <= this.dataBbox[2] ? lon + 360 : lon;
    const y = lat;

    const xCell = (x - this.dataBbox[0]) / this.part[0];
    const yCell = (y - this.dataBbox[1]) / this.part[1];

    const xFloorCell = Math.floor(xCell);
    const xCeilCell = Math.ceil(xCell);
    const yFloorCell = this.height - Math.floor(yCell);
    const yCeilCell = this.height - Math.ceil(yCell);

    const x1 = this.dataBbox[0] + xFloorCell * this.part[0];
    const x2 = this.dataBbox[0] + xCeilCell * this.part[0];
    const y1 = this.dataBbox[3] - yFloorCell * this.part[1];
    const y2 = this.dataBbox[3] - yCeilCell * this.part[1];

    const q11 = this.grid[xFloorCell + yFloorCell * this.width];
    const q12 = this.grid[xFloorCell + yCeilCell * this.width];
    const q21 = this.grid[xCeilCell + yFloorCell * this.width];
    const q22 = this.grid[xCeilCell + yCeilCell * this.width];

    const kx1 = x2 - x;
    const kx2 = x2 - x1;
    const kx3 = x - x1;
    const ky1 = y2 - y1;

    const r1 = (kx1 / kx2) * q11 + (kx3 / (x2 - x1)) * q21;
    const r2 = (kx1 / kx2) * q12 + (kx3 / (x2 - x1)) * q22;

    return ((y2 - y) / ky1) * r1 + ((y - y1) / ky1) * r2;
  }
}
