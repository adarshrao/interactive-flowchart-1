<template>
  <TheFlowchart
    @setCurrentNodeId="setCurrentNodeId"
    @toggleIntroPanel="toggleIntroPanel"
    @mousedown="toggleIntroPanel(true)"
  />
  <TheIntroPanel
    :siteTitle="userSetup.title"
    :siteSubtitle="userSetup.subtitle"
    @toggleIntroPanel="toggleIntroPanel()"
  />
</template>

<script>
import { mapStores, mapActions } from 'pinia';

import TheFlowchart from '@/components/TheFlowchart.vue';
import TheIntroPanel from '@/components/TheIntroPanel.vue';

import { useFlowchartStore } from '@/stores/FlowchartStore.js';
import { useViewStore } from '@/stores/ViewStore.js';

export default {
  name: 'App',

  components: {
    TheFlowchart,
    TheIntroPanel
  },

  data() {
    return {
      userSetup: {}
    }
  },

  computed: {
    ...mapStores(
      useFlowchartStore,
      useViewStore
    )
  },

  methods: {
    ...mapActions(useFlowchartStore, [
      'saveToLocalStorage',
      'resumeFromLocalStorage'
    ]),

    async fetchUserSetup() {
      fetch('setup.json')
        .then(response => response.json())
        .then(data => {
          this.userSetup = data;
          this.applyUserSetup();
        })
        .catch(error => console.log(error));
    },
    applyUserSetup() {
      this.flowchartStore.flowchartId = this.userSetup.id;

      this.resumeFromLocalStorage();

      document.title = this.userSetup.title;

      for (const [property, color] of Object.entries(this.userSetup.colors)) {
        document.documentElement.style.setProperty('--' + property, this.hexToRgb(color));
      }
    },

    setCurrentNodeId(nodeId) {
      this.flowchartStore.currentNodeId = nodeId;
      this.saveToLocalStorage();
    },

    toggleIntroPanel(forceClose = false) {
      if (forceClose || this.viewStore.introPanelVisible) {
        this.viewStore.introPanelVisible = false;
      } else {
        this.viewStore.introPanelVisible = true;
      }
    },

    hexToRgb(hex) {
      const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
      hex = hex.replace(shorthandRegex, function(m, r, g, b) {
        return r + r + g + g + b + b;
      });

      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? parseInt(result[1], 16) + ',' + parseInt(result[2], 16) + ',' + parseInt(result[3], 16) : null;
    }
  },

  created() {
    this.fetchUserSetup();
  }
}
</script>

<style lang="scss">
@import '@/assets/normalize.css';
@import '@/assets/fonts.css';
@import '@/assets/variables.css';

body {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: rgb(var(--background-color));
}

#app {
  display: contents;
  font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen-Sans, Ubuntu, Cantarell, 'Helvetica Neue', sans-serif;
  font-size: 15px;
  text-rendering: optimizeLegibility;
  color: rgb(var(--text-color));
  -webkit-tap-highlight-color: rgba(0,0,0,0);
}

*:focus {
  outline: none;
}

*:focus-visible {
  box-shadow: 0 0 0 2px rgb(var(--background-color)), 0 0 0 4px rgb(var(--text-color)) !important;
}
</style>
