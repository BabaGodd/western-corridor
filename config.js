window.CONFIG = {
  MAPBOX_TOKEN: 'pk.eyJ1IjoiYmFiYS1ib2xnYSIsImEiOiJjbXViNnYzYjcwMHJuMnpzZ3NqdW12c3prIn0.fPUWfm092CAVCwfpL1wevA', // must start with pk.
  SPEED_KM_S: 0.1446, // Journey duration is derived from the smoothed Western route in app.js.
  ROUTE_SHARPNESS: 0.82,
  ROUTE_RESOLUTION: 12000,
  CHASE_BEHIND_KM: 0.18,
  CAM_HEIGHT_M: 120,
  CAMERA_PITCH: 68, // Initial pitch; the active chase camera aims at the train.
  TRAIN_MODEL_URL: './Ghana_Freight_Train.glb',
  TRAIN_SCALE: [1, 1, 1],
  TRAIN_LATERAL_OFFSET_M: 1.7,
  TRAIN_BEARING_OFFSET_DEG: 0,
  // Official Western Corridor stops, traced from the GRDA map (main line, south to north). [lng, lat]
  STATIONS: [
    { name: 'Takoradi',     lngLat: [-1.7603, 4.8982] },
    { name: 'Sekondi',      lngLat: [-1.7137, 4.9340] },
    { name: 'Tarkwa',       lngLat: [-1.9833, 5.3000] },
    { name: 'Huni Valley',  lngLat: [-1.9169, 5.4706] },
    { name: 'Dunkwa',       lngLat: [-1.7833, 5.9667] },
    { name: 'Awaso',        lngLat: [-2.2681, 6.2312] },
    { name: 'Bibiani',      lngLat: [-2.3333, 6.4667] },
    { name: 'Nyinahin',     lngLat: [-2.1167, 6.6000] },
    { name: 'Sunyani',      lngLat: [-2.3268, 7.3399] },
    { name: 'Bamboi',       lngLat: [-2.0330, 8.1670] },
    { name: 'Bole',         lngLat: [-2.4834, 9.0345] },
    { name: 'Sawla',        lngLat: [-2.4100, 9.2700] },
    { name: 'Wa',           lngLat: [-2.5019, 10.0607] },
    { name: 'Jirapa',       lngLat: [-2.7016, 10.5369] },
    { name: 'Hamile',       lngLat: [-2.7333, 10.9833] }
  ]
};