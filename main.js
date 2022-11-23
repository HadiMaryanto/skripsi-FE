import 'ol/ol.css';
import { fromLonLat } from 'ol/proj';
import { Map, View } from 'ol';
import { Vector as VectorLayer, Tile as TileLayer } from 'ol/layer';
import { Vector as VectorSource, Stamen, OSM } from 'ol/source';
import Overlay from 'ol/Overlay';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
//! [renderer]
import Renderer from 'ol/renderer/webgl/PointsLayer';
//! [renderer]
import { clamp } from 'ol/math';

const source = new VectorSource();

const urlSearchParams = new URLSearchParams(window.location.search);
const yearParam = Object.fromEntries(urlSearchParams.entries()).year;

const client = new XMLHttpRequest();
// client.open('GET', 'data/meteorites.csv');
client.open('GET', `http://127.0.0.1:8000/api/map/kebakaranTimeline?year=${yearParam}`);
// console.log('http://127.0.0.1:8000/api/map/kebakaranTimeline');
// console.log('data/meteorites.csv');
client.onload = function() {
    const csv = client.responseText;
    let curIndex;
    let prevIndex = 0;
    const features = [];

    while ((curIndex = csv.indexOf('\n', prevIndex)) > 0) {
        const line = csv.substr(prevIndex, curIndex - prevIndex).split(',');
        // console.log(line[4], line[3]);
        prevIndex = curIndex + 1;
        if (prevIndex === 0) {
            continue; // skip header
        }

        const coords = fromLonLat([parseFloat(line[4]), parseFloat(line[3])]);
        // console.log(coords);
        features.push(new Feature({
            mass: parseFloat(line[1]) || 0,
            year: parseInt(line[2]) || 0,
            geometry: new Point(coords)
        }));
    }

    source.addFeatures(features);
};
client.send();

//! [years]
const minYear = 1850;
const maxYear = 2015;
const span = maxYear - minYear;
const rate = 10; // years per second

const start = Date.now();
let currentYear = minYear;
//! [years]

//! [customlayer]

class CustomLayer extends VectorLayer {
    createRenderer() {
        return new Renderer(this, {
            //! [attributes]
            attributes: [{
                    name: 'size',
                    callback: function(feature) {
                        return 32 * clamp(feature.get('mass') / 200000, 0, 1) + 13;
                    }
                },
                {
                    name: 'year',
                    callback: function(feature) {
                        return feature.get('year');
                    },
                }
            ],

            //! [attributes]
            //! [uniforms]
            uniforms: {
                u_currentYear: function() {
                    return currentYear;
                }
            },
            //! [uniforms],
            //! [shaders]
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
                //! [shaders]
        });
    }
}
const Custome = new CustomLayer({
    source: source
});
// console.log(Custome);

//! [declaration]
const map = new Map({
    //! [declaration]
    target: 'map-container',
    layers: [
        new TileLayer({
            source: new OSM()
        }),
        Custome,
    ],
    // 101.438309, 0.510440
    view: new View({
        center: fromLonLat([114.419803, 0.341276]),
        zoom: 5
    })
});
// var container = document.getElementById('popup');
// var content = document.getElementById('popup-content');
// var closer = document.getElementById('popup-closer');


// console.log(map);
//! [animate]
const yearElement = document.getElementById('year');

function render() {
    const elapsed = rate * (Date.now() - start) / 6000;
    currentYear = minYear + (elapsed % span);
    yearElement.innerText = currentYear.toFixed(0);
    // console.log(elapsed);
    map.render();
    requestAnimationFrame(render);
}

render();
//! [animate]
const info = document.getElementById('info');
info.style.pointerEvents = 'none';
const tooltip = new bootstrap.Tooltip(info, {
    animation: false,
    customClass: 'pe-none',
    offset: [0, 5],
    title: '-',
    trigger: 'manual'
});
// info.tooltip({
//     animation: false,
//     trigger : 'manual'
// });
let currentFeature;
const displayFeatureInfo = function(pixel, target) {
    const feature = target.closest('.ol-control')
    ? undefined
    : map.forEachFeatureAtPixel(pixel, function (feature){
        return feature;
    });
    if(feature){
        info.style.left = pixel[0] + 'px';
        info.style.top = pixel[1] + 'px';
        if (feature !== currentFeature) {
            tooltip.setContent({'.tooltip-inner': feature.get('mass')});
        }
        if(currentFeature){
            tooltip.update();
        }else{
            tooltip.show();
        }
    }else{
        tooltip.hide();
    }
    currentFeature = feature;
};
    // info.css({
    //     left: pixel[0] + 'px',
    //     top : (pixel[1] - 15) + 'px' 
    // });

// const feature = map.forEachFeatureAtPixel(pixel, function(feature){
//     return feature;
// });
// if(feature) {
//     const isi = feature.values_;
//     const mass = isi.mass;

//     tampil = nama + ' , ';

//     info.tooltip('hide')
//     .attr('data-original-title', tampil)
//     .tooltip('fixTitle')
//     .tooltip('show')
// }else{
//     info.tooltip('hide');
// }
// };

map.on('pointermove', function(evt){
    if (evt.dragging) {
        tooltip.hide();
        currentFeature = undefined;
        return;
    }
    const pixel = map.getEventPixel(evt.originalEvent);
    displayFeatureInfo(pixel, evt.originalEvent.target);
});

map.on('click', function(evt){
    displayFeatureInfo(evt.pixel, evt.originalEvent.target);
});
map.getTargetElement().addEventListener('pointerleave', function () {
    tooltip.hide();
    currentFeature = undefined;
});