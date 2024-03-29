import { Map, View } from "ol";
import TileLayer from "ol/layer/Tile";
import "ol/ol.css";
import { fromLonLat } from "ol/proj";
import OSM from "ol/source/OSM";
import HeatmapTile from "src/lib";

new Map({
  target: "map",
  view: new View({
    center: fromLonLat([37.41, 8.82]),
    zoom: 4,
  }),
  layers: [
    new TileLayer({
      source: new OSM(),
    }),
    new HeatmapTile({
      url: "./assets/temp.png",
      webGLTileProps: {
        opacity: 0.7,
      },
    }),
  ],
});
