import { defineStore } from 'pinia';

export const useFlowchartStore = defineStore('flowchart', {
  state: () => ({
    flowchartId: 'flowchart-template',

    flowchartNodes: {},
    currentNodeId: 'n-001',
    teasedItems: [],
    revealedItems: [],
    // ids of nodes that have been the current node at some point. Drives the
    // end-panel completion check (see TheFlowchart.maybeOpenEndPanel).
    visitedNodes: [],
    // whether the end panel has already auto-opened once (so it doesn't nag).
    endPanelShown: false,
    // whether the user hit "Reveal all" — flower petals reveal via this flag
    // (they don't respond to the normal revealed state; see updateAppearance).
    revealedAll: false,

    // Properties persisted to localStorage. currentNodeId intentionally excluded
    // so refresh always lands on the first node.
    storedProperties: [
      'teasedItems',
      'revealedItems',
      'visitedNodes',
      'endPanelShown',
      'revealedAll'
    ],
    resumedFromLocalStorage: false,
    resetActionAvailable: false
  }),
  getters: {
    computedFlowchartId(state) {
      return 'flowchart_' + state.flowchartId;
    },
    currentNode(state) {
      return state.flowchartNodes[state.currentNodeId];
    }
  },
  actions: {
    saveToLocalStorage() {
      const currentState = {};

      this.storedProperties.forEach((property) => {
        currentState[property] = this[property];
      });

      localStorage.setItem(this.computedFlowchartId, JSON.stringify(currentState));
    },
    resumeFromLocalStorage() {
      if (localStorage.getItem(this.computedFlowchartId)) {
        this.resumedFromLocalStorage = true;
        this.resetActionAvailable = true;

        const restoredState = JSON.parse(localStorage.getItem(this.computedFlowchartId));

        this.storedProperties.forEach((property) => {
          if (property in restoredState) {
            this[property] = restoredState[property];
          }
        });
      }
    },
    clearLocalStorageAndReload() {
      localStorage.removeItem(this.computedFlowchartId);
      location.reload();
    }
  }
});
