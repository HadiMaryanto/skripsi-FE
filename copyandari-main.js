import 'ol/ol.css';
import {fromLonLat} from 'ol/proj';
import {Map, View} from 'ol';
import {Vector as VectorLayer, Tile as TileLayer} from 'ol/layer';
import {Vector as VectorSource, Stamen} from 'ol/source';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import WebGLPointsLayer from 'ol/layer/WebGLPoints';
import Renderer from 'ol/renderer/webgl/PointsLayer';


const minYear = 1850;
const maxYear = 2015;
const span = maxYear - minYear;
const rate = 10; // years per second

const start = Date.now();
let currentYear = minYear;

const source = new VectorSource();

const client = new XMLHttpRequest();
client.open('GET', 'data/meteorites.csv');
client.onload = function() {
  const csv = client.responseText;
  const features = [];

  let prevIndex = csv.indexOf('\n') + 1; // scan past the header line

  let curIndex;
  while ((curIndex = csv.indexOf('\n', prevIndex)) != -1) {
    const line = csv.substr(prevIndex, curIndex - prevIndex).split(',');
    // console.log(line);
    prevIndex = curIndex + 1;

    const coords = fromLonLat([parseFloat(line[4]), parseFloat(line[3])]);
    if (isNaN(coords[0]) || isNaN(coords[1])) {
      // guard against bad data
      continue;
    }

    features.push(new Feature({
      mass: parseFloat(line[1]) || 0,
      year: parseInt(line[2]) || 0,
      geometry: new Point(coords)
    }));
    
  }
  source.addFeatures(features);
};

client.send();


const map = new Map({  
  layers: [
    new TileLayer({
      source: new Stamen({
        layer: 'toner'
      })
    }),
    new WebGLPointsLayer({
      source: source,
      style: {
        symbol: {
          symbolType: 'circle',
      // equivalent to: 18 * clamp('mass' / 200000, 0, 1) + 8
          size: ['+', ['*', ['clamp', ['*', ['get', 'mass'], 1/20000], 0, 1], 18], 8],
          color: 'rgba(255,0,0,0.5)'
        }
      },
      attributes: [{
        name: 'size',
        callback: function (features) {
          return 32 * clamp(features.get('mass') / 200000, 0, 1) + 16;
        }
      },
      {
        name: 'year',
        callback: function (features) {
          return features.get('year');
        },
      }],                  
    })    
  ],
  target: 'map-container',
  view: new View({
    center: [0, 0],
    zoom: 2
  })
});

const yearElement = document.getElementById('year');

class CustomLayer extends VectorLayer {
  createRenderer() {
    return new Renderer(this, {
      uniforms: {
        u_currentYear: function() {
          return currentYear;
        }
      },      
      vertexShader: `
        precision mediump float;

        uniform mat4 u_projectionMatrix;
        uniform mat4 u_offsetScaleMatrix;
        uniform mat4 u_offsetRotateMatrix;

        attribute vec2 a_position;
        attribute float a_index;
        attribute float a_size;
        attribute float a_year;

        varying vec2 v_texCoord;
        varying float v_year;

        void main(void) {
          mat4 offsetMatrix = u_offsetScaleMatrix;
          float offsetX = a_index == 0.0 || a_index == 3.0 ? -a_size / 2.0 : a_size / 2.0;
          float offsetY = a_index == 0.0 || a_index == 1.0 ? -a_size / 2.0 : a_size / 2.0;
          vec4 offsets = offsetMatrix * vec4(offsetX, offsetY, 0.0, 0.0);
          gl_Position = u_projectionMatrix * vec4(a_position, 0.0, 1.0) + offsets;
          float u = a_index == 0.0 || a_index == 3.0 ? 0.0 : 1.0;
          float v = a_index == 0.0 || a_index == 1.0 ? 0.0 : 1.0;
          v_texCoord = vec2(u, v);
          v_year = a_year;
        }`,
      fragmentShader: `
        precision mediump float;

        uniform float u_currentYear;

        varying vec2 v_texCoord;
        varying float v_year;

        void main(void) {
          if (v_year > u_currentYear) {
            discard;
          }

          vec2 texCoord = v_texCoord * 2.0 - vec2(1.0, 1.0);
          float sqRadius = texCoord.x * texCoord.x + texCoord.y * texCoord.y;

          float factor = pow(1.1, u_currentYear - v_year);

          float value = 2.0 * (1.0 - sqRadius * factor);
          float alpha = smoothstep(0.0, 1.0, value);

          gl_FragColor = vec4(1.0, 0.0, 0.0, 0.5);
          gl_FragColor.a *= alpha;
          gl_FragColor.rgb *= gl_FragColor.a;
        }`
      
    })
    map.createRenderer();
  requestAnimationFrame(createRenderer);
  }
};

function render() {
  const elapsed = rate * (Date.now() - start) / 1000;
  currentYear = minYear + (elapsed % span);
  yearElement.innerText = currentYear.toFixed(0);

  map.render();
  requestAnimationFrame(render);
  
}
render();
createRenderer();


