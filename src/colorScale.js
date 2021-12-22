const HexRegExp = /^#([0-9a-fA-F]{3,6})$/
const RgbRegExp = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/

const hexToArray = (str) => {
    if (str.length === 4) {
        return [
            parseInt(str[1] + str[1], 16),
            parseInt(str[2] + str[2], 16),
            parseInt(str[3] + str[3], 16)
        ]
    } else if (str.length === 7) {
        return [
            parseInt(str[1] + str[2], 16),
            parseInt(str[3] + str[4], 16),
            parseInt(str[5] + str[6], 16)
        ]
    } else {
        throw Error('invalid hex color, use #fff or #ffffff')
    }
}

const rgbToArray = (str) => {
    const match = str.match(RgbRegExp)
    return [+match[1] % 255, +match[2] % 255, +match[3] % 255]
}

const convertSchema = (schema) => {
    return schema.map(([value, color]) => {
        if (color.search(HexRegExp) != -1) {
            return [value, hexToArray(color)]
        } else if (color.search(RgbRegExp) != -1) {
            return [value, rgbToArray(color)]
        } else {
            throw Error('invalid schema color, use #ffffff or rgb(255, 255, 255)')
        }
    })
}

const getRange = (value, schema) => {
    if (value < schema[0][0]) {
        return schema[0][1]
    }
    for (let i = 1; i < schema.length; i++) {
        if (value < schema[i][0]) {
            return [schema[i - 1], schema[i]]
        }
    }
    return schema[schema.length - 1][1]
}

const normalizeValue = (value, min, max) => (value - min) / (max - min)

const interpolate = (value, left, right) => Math.round(left + (right - left) * value);

const getRgb = (value, left, right) => `rgb(${interpolate(value, left[0], right[0])},${interpolate(value, left[1], right[1])},${interpolate(value, left[2], right[2])})`

export const colorScale = (schema) => {
    const convertedSchema = convertSchema(schema);
    return (value) => {
        const range = getRange(value, convertedSchema)
        if (range.length === 3) {
            return `rgb(${range[0]},${range[1]},${range[2]})`
        }

        return getRgb(
            normalizeValue(value, range[0][0], range[1][0]),
            range[0][1],
            range[1][1]
        );
    }
}