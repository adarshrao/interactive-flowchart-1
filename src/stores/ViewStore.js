import { defineStore } from 'pinia';

export const useViewStore = defineStore('view', {
  state: () => ({
    // on mobile the panel is full-screen, so open straight to the flowchart;
    // the info is one tap away via the popup's "About this project" or the (i) button
    introPanelVisible: window.innerWidth > 600,
    howToVisible: false,
    endPanelVisible: false,
    // true once the flowchart SVG has loaded and been set up
    flowchartLoaded: false,
    // the first (on-load) "How to use" popup has been closed
    howToDismissed: false
  })
});