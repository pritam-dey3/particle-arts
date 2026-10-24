// The only list of arts. The gallery is built from this file, and each art's
// code is fetched only when it is opened.
//
//   id          URL value: ?art=<id>   (must be unique and URL-safe)
//   title       card heading and page title
//   description one or two lines shown on the card
//   accent      CSS colour used for this art's chrome
//   load        dynamic import of the art module (never a static import)

export const arts = [
  {
    id: "particle-network",
    title: "Particle Network",
    description: "Drifting nodes that link when they get close. Move to repel, click to ripple.",
    accent: "#4facfe",
    load: () => import("./particle-network.js"),
  },
  {
    id: "wave-field",
    title: "Wave Field",
    description: "A grid of dots riding two interfering sine waves.",
    accent: "#ff7ac6",
    load: () => import("./wave-field.js"),
  },
];
