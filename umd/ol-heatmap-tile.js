(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory(require('ol/proj'), require('ol/source/DataTile'), require('ol/layer/WebGLTile')) :
    typeof define === 'function' && define.amd ? define(['ol/proj', 'ol/source/DataTile', 'ol/layer/WebGLTile'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.HeatmapTile = factory(global.ol.proj, global.ol.source.DataTile, global.ol.layer.WebGLTile));
})(this, (function (proj, DataTile, WebGLTile) { 'use strict';

    function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

    var DataTile__default = /*#__PURE__*/_interopDefaultLegacy(DataTile);
    var WebGLTile__default = /*#__PURE__*/_interopDefaultLegacy(WebGLTile);

    const HexRegExp = /^#([0-9a-fA-F]{3,6})$/;
    const RgbRegExp = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/;

    const hexToArray = str => {
      if (str.length === 4) {
        return [parseInt(str[1] + str[1], 16), parseInt(str[2] + str[2], 16), parseInt(str[3] + str[3], 16)];
      } else if (str.length === 7) {
        return [parseInt(str[1] + str[2], 16), parseInt(str[3] + str[4], 16), parseInt(str[5] + str[6], 16)];
      } else {
        throw Error('invalid hex color, use #fff or #ffffff');
      }
    };

    const rgbToArray = str => {
      const match = str.match(RgbRegExp);
      return [+match[1] % 255, +match[2] % 255, +match[3] % 255];
    };

    const convertSchema = schema => {
      return schema.map(_ref => {
        let [value, color] = _ref;

        if (color.search(HexRegExp) != -1) {
          return [value, hexToArray(color)];
        } else if (color.search(RgbRegExp) != -1) {
          return [value, rgbToArray(color)];
        } else {
          throw Error('invalid schema color, use #ffffff or rgb(255, 255, 255)');
        }
      });
    };

    const getRange = (value, schema) => {
      if (value < schema[0][0]) {
        return schema[0][1];
      }

      for (let i = 1; i < schema.length; i++) {
        if (value < schema[i][0]) {
          return [schema[i - 1], schema[i]];
        }
      }

      return schema[schema.length - 1][1];
    };

    const normalizeValue = (value, min, max) => (value - min) / (max - min);

    const interpolate = (value, left, right) => Math.round(left + (right - left) * value);

    const getRgb = (value, left, right) => `rgb(${interpolate(value, left[0], right[0])},${interpolate(value, left[1], right[1])},${interpolate(value, left[2], right[2])})`;

    const colorScale = schema => {
      const convertedSchema = convertSchema(schema);
      return value => {
        const range = getRange(value, convertedSchema);

        if (range.length === 3) {
          return `rgb(${range[0]},${range[1]},${range[2]})`;
        }

        return getRgb(normalizeValue(value, range[0][0], range[1][0]), range[0][1], range[1][1]);
      };
    };

    class HeatmapTile extends WebGLTile__default["default"] {
      grid = new Uint8Array();
      width = 0;
      part = 0;
      size = 256;

      constructor(options) {
        super({ ...options.olOptions,
          visible: false
        });
        this.renderValues = options.renderValues || false;
        this.tileGrid = options.tileGrid || undefined;
        this.projection = options.projection || "EPSG:3857";
        this.colorSchema = options.colorSchema || [[0, '#CD0074'], [21, '#7209AB'], [43, '#3914B0'], [64, '#1240AC'], [106, '#009A9A'], [128, '#00CC00'], [149, '#9FEE00'], [170, '#FFFF00'], [191, '#FFD300'], [213, '#FFAA00'], [234, '#FF7400'], [255, '#FF0000']];
        this.colors = colorScale(this.colorSchema);
        this.compression = options.compression || this.renderValues ? 64 : 4;
        this.dataBbox = options.dataBbox || [-180, -90, 180, 90];
        this.renderBbox = options.renderBbox || this.dataBbox;
        this.valueMiniMaxes = options.valueMiniMaxes || [0, 255];
        this.valueRoundDigits = options.valueRoundDigits || 0;
        this.valuesFont = options.valuesFont || '24px sans-serif';
        this.valuesColor = options.valuesColor || '#fff';

        if (options.data) {
          this.setData(options.data);
        } else if (options.url) {
          this.setUrl(options.url);
        }
      }

      setColorSchema(colorSchema) {
        this.colorSchema = colorSchema;
        this.colors = colorScale(colorSchema);
      }

      setDataBbox(bbox) {
        this.dataBbox = bbox;
        this.setRenderBbox(bbox);

        this._updatePart();
      }

      setRenderBbox(bbox) {
        this.renderBbox = bbox;
      }

      setTileGrid(tileGrid) {
        this.tileGrid = tileGrid;
      }

      setProjection(projection) {
        this.projection = projection;
      }

      setData(data) {
        this.grid = data.grid;
        this.width = data.width;

        this._updatePart();

        this._renderTiles();
      }

      setUrl(url) {
        this.url = url;

        this._loadData();
      }

      setValuesFont(valuesFont) {
        this.valuesFont = valuesFont;
      }

      setValuesColor(valuesColor) {
        this.valuesColor = valuesColor;
      }

      setValueMiniMaxes(valueMiniMaxes) {
        this.valueMiniMaxes = valueMiniMaxes;
      }

      setValueRoundDigits(valueRoundDigits) {
        this.valueRoundDigits = valueRoundDigits;
      }

      getValueFromLonLat(lon, lat) {
        return this._scaleValue(this._getGridValue(lon, lat));
      }

      refresh() {
        // clear tileTextureCache_ by private field see https://github.com/openlayers/openlayers/issues/13051
        // @ts-ignore
        this.getRenderer().tileTextureCache_.clear();
        this.changed();
      }

      _scaleValue(value) {
        return (value * (this.valueMiniMaxes[1] - this.valueMiniMaxes[0]) / 255 + this.valueMiniMaxes[0]).toFixed(this.valueRoundDigits);
      }

      _updatePart() {
        if (this.width && this.dataBbox) {
          this.part = Math.round(this.width / Math.abs(this.dataBbox[2] - this.dataBbox[0]));
        }
      }

      _loadData() {
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

            this.setData({
              grid: imageArray,
              width: img.width
            });
          }
        };

        if (this.url) {
          img.src = this.url;
        }

        img.crossOrigin = "anonymous";
      }

      _renderTiles() {
        if (this.getSource()) {
          this.refresh();
        } else {
          const loader = this._getLoader();

          this.setSource(new DataTile__default["default"]({
            loader,
            projection: this.projection,
            ...(this.tileGrid && {
              tileGrid: this.tileGrid
            }),
            transition: 0
          }));
          this.setVisible(true);
        }
      }

      _getLoader() {
        const canvas = document.createElement("canvas");
        canvas.width = this.size;
        canvas.height = this.size;
        const context = canvas.getContext("2d");
        context.font = this.valuesFont;
        context.fillStyle = this.valuesColor;
        const half = this.compression / 2;

        const bboxConditionFunc = this._getBboxConditionFunc();

        return (z, x, y) => {
          const tileGrid = this.getSource().getTileGrid();
          const tileGridOrigin = tileGrid.getOrigin(z);
          const tileSizeAtResolution = this.size * tileGrid.getResolution(z);
          const bbox = [tileGridOrigin[0] + tileSizeAtResolution * x, tileGridOrigin[1] + tileSizeAtResolution * (-y - 1), tileGridOrigin[0] + tileSizeAtResolution * (x + 1), tileGridOrigin[1] + tileSizeAtResolution * -y];
          context.clearRect(0, 0, this.size, this.size);
          const step = (bbox[2] - bbox[0]) / this.size;
          const pixelRenderFunc = this.renderValues ? (value, i, j) => context.fillText(this._scaleValue(value), i - half, this.size - j - half) : (value, i, j) => {
            context.fillStyle = this.colors(value);
            context.fillRect(i - half, this.size - j - half, this.compression, this.compression);
          };

          for (let i = 0; i <= this.size; i += this.compression) {
            for (let j = 0; j <= this.size; j += this.compression) {
              const point = proj.toLonLat([bbox[0] + step * (i + half), bbox[1] + step * (j + half)], this.projection);

              if (bboxConditionFunc(point[0], point[1])) {
                const value = this._getGridValue(point[0], point[1]);

                pixelRenderFunc(value, i, j);
              }
            }
          }

          return Promise.resolve(new Uint8Array(context.getImageData(0, 0, this.size, this.size).data.buffer));
        };
      }

      _getBboxConditionFunc() {
        if (this.renderBbox[2] < this.renderBbox[0]) {
          return (lon, lat) => lon >= this.renderBbox[0] && lat >= this.renderBbox[1] && lat <= this.renderBbox[3] || lon >= -180 && lon <= this.renderBbox[2] && lat >= this.renderBbox[1] && lat <= this.renderBbox[3];
        }

        return (lon, lat) => lon >= this.renderBbox[0] && lon <= this.renderBbox[2] && lat >= this.renderBbox[1] && lat <= this.renderBbox[3];
      }

      _getGridValue(lon, lat) {
        const x = lat;
        const y = this.dataBbox[2] < this.dataBbox[0] && lon <= this.dataBbox[2] ? lon + 360 : lon;
        const x1 = Math.floor(x * this.part) / this.part;
        const x2 = Math.ceil(x * this.part) / this.part;
        const y1 = Math.floor(y * this.part) / this.part;
        const y2 = Math.ceil(y * this.part) / this.part;
        const q11 = this.grid[(this.dataBbox[3] - x1) * this.part * this.width + (y1 - this.dataBbox[0]) * this.part];
        const q12 = this.grid[(this.dataBbox[3] - x1) * this.part * this.width + (y2 - this.dataBbox[0]) * this.part];
        const q21 = this.grid[(this.dataBbox[3] - x2) * this.part * this.width + (y1 - this.dataBbox[0]) * this.part];
        const q22 = this.grid[(this.dataBbox[3] - x2) * this.part * this.width + (y2 - this.dataBbox[0]) * this.part];
        const d = (x2 - x1) * (y2 - y1);
        return q11 * (x2 - x) * (y2 - y) / d + q21 * (x - x1) * (y2 - y) / d + q12 * (x2 - x) * (y - y1) / d + q22 * (x - x1) * (y - y1) / d;
      }

    }

    return HeatmapTile;

}));
