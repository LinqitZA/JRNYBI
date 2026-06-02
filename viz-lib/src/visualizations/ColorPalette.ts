import { values } from "lodash";

// Define color palettes
export const BaseColors = {
  Blue: "#356AFF",
  Red: "#E92828",
  Green: "#3BD973",
  Purple: "#604FE9",
  Cyan: "#50F5ED",
  Orange: "#FB8D3D",
  "Light Blue": "#799CFF",
  Lilac: "#B554FF",
  "Light Green": "#8CFFB4",
  Brown: "#A55F2A",
  Black: "#000000",
  Gray: "#494949",
  Pink: "#FF7DE3",
  "Dark Blue": "#002FB4",
};

// Additional colors for the user to choose from
export const AdditionalColors = {
  "Indian Red": "#981717",
  "Green 2": "#17BF51",
  "Green 3": "#049235",
  "Dark Turquoise": "#00B6EB",
  "Dark Violet": "#A58AFF",
  "Pink 2": "#C63FA9",
};

const Viridis = {
  1: '#440154',
  2: '#48186a',
  3: '#472d7b',
  4: '#424086',
  5: '#3b528b',
  6: '#33638d',
  7: '#2c728e',
  8: '#26828e',
  9: '#21918c',
  10: '#1fa088',
  11: '#28ae80',
  12: '#3fbc73',
  13: '#5ec962',
  14: '#84d44b',
  15: '#addc30',
  16: '#d8e219',
  17: '#fde725',
};

const Tableau = {
  1 : "#4e79a7",
  2 : "#f28e2c",
  3 : "#e15759",
  4 : "#76b7b2",
  5 : "#59a14f",
  6 : "#edc949",
  7 : "#af7aa1",
  8 : "#ff9da7",
  9 : "#9c755f",
  10 : "#bab0ab",
}

const D3Category10 = {
  1 : "#1f77b4",
  2 : "#ff7f0e",
  3 : "#2ca02c",
  4 : "#d62728",
  5 : "#9467bd",
  6 : "#8c564b",
  7 : "#e377c2",
  8 : "#7f7f7f",
  9 : "#bcbd22",
  10 : "#17becf",
}

// ---------------------------------------------------------------------------
// JRNY palette — synced with client/app/assets/less/jrny-theme.less
//
// Categorical: WCAG-AA contrast, deuteranopia-tested. Neighbouring entries
// diverge in both hue AND luminance so series stay distinguishable in
// greyscale or with red-green colour blindness.
//
// Semantic: positive / negative / warning / neutral / info — used by the
// counter visualization and table conditional formatting.
// ---------------------------------------------------------------------------
export const JrnyCategorical = {
  1: "#4e79a7", // steel blue
  2: "#f28e2b", // burnt orange
  3: "#59a14f", // muted green
  4: "#e15759", // coral red
  5: "#76b7b2", // teal
  6: "#edc948", // mustard
  7: "#b07aa1", // dusty purple
  8: "#ff9da7", // peach pink
  9: "#9c755f", // brown
  10: "#bab0ac", // warm grey
};

export const JrnySemantic = {
  positive:    "#117a3b",
  positiveBg:  "#d1fae5",
  negative:    "#b42318",
  negativeBg:  "#fee2e2",
  warning:     "#b54708",
  warningBg:   "#fef3c7",
  neutral:     "#475569",
  neutralBg:   "#f1f5f9",
  info:        "#1d4ed8",
  infoBg:      "#dbeafe",
};

export const JrnyCategoricalArray = values(JrnyCategorical);

let ColorPalette = {
  ...BaseColors,
  ...AdditionalColors,
};

export const ColorPaletteArray = values(ColorPalette);

export default ColorPalette;

export const AllColorPalettes = {
  "JRNY" : JrnyCategorical,
  "Redash" : ColorPalette,
  "Viridis" : Viridis,
  "Tableau 10" : Tableau,
  "D3 Category 10" : D3Category10,
}

export const AllColorPaletteArrays = {
  "JRNY" : JrnyCategoricalArray,
  "Redash" : ColorPaletteArray,
  "Viridis" : values(Viridis),
  "Tableau 10" : values(Tableau),
  "D3 Category 10" : values(D3Category10),
};

export const ColorPaletteTypes = {
  "JRNY" : 'discrete',
  "Redash" : 'discrete',
  "Viridis" : 'continuous',
  "Tableau 10" : 'discrete',
  "D3 Category 10" : 'discrete',
}
