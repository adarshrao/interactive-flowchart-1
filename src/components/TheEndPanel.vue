<template>
  <transition name="end-fade">
    <div
      v-if="viewStore.endPanelVisible"
      class="end-panel"
      :class="{ 'panel-visible': viewStore.introPanelVisible }"
      role="dialog"
      aria-label="Learn more"
    >
      <button class="end-close" title="Close" @click="close">×</button>

      <h2 class="end-title">Learn More</h2>
      <p class="end-intro">
        You've explored the Flower of Transformation and some case studies — some
        global, some local. Here are some ways to learn more and get involved in
        alternatives.
      </p>

      <div class="end-section">
        <ul>
          <li v-for="link in links" :key="link.href">
            <a :href="link.href" target="_blank" rel="noopener">{{ link.label }}</a>
          </li>
        </ul>
      </div>

      <button class="end-continue" @click="close">Keep exploring</button>
    </div>
  </transition>
</template>

<script>
import { mapStores } from 'pinia';

import { useViewStore } from '@/stores/ViewStore.js';

export default {
  name: 'TheEndPanel',

  data() {
    return {
      links: [
        { label: 'Vikalp Sangam', href: 'https://vikalpsangam.org/' },
        { label: 'Global Tapestry of Alternatives', href: 'https://globaltapestryofalternatives.org/' },
        { label: 'Radical Ecological Democracy', href: 'https://radicalecologicaldemocracy.org/' },
        { label: 'The Search For Radical Alternatives', href: 'https://vikalpsangam.org/wp-content/uploads/migrate/Resources/alternetivesframeworkbookletrevisedfinal1512.pdf' }
      ]
    }
  },

  computed: {
    ...mapStores(useViewStore)
  },

  methods: {
    close() {
      this.viewStore.endPanelVisible = false;
    },
    // close when the user interacts anywhere outside the panel (but not on the
    // "Learn More" control-bar button, which is what reopens it).
    handleOutsideClick(event) {
      if (!this.viewStore.endPanelVisible) return;
      if (event.target.closest('.end-panel')) return;
      if (event.target.closest('.next-steps-btn')) return;
      this.viewStore.endPanelVisible = false;
    }
  },

  mounted() {
    document.addEventListener('mousedown', this.handleOutsideClick);
  },

  unmounted() {
    document.removeEventListener('mousedown', this.handleOutsideClick);
  }
}
</script>

<style lang="scss">
@import '@/assets/variables.css';

.end-panel {
  position: fixed;
  z-index: 90;
  // opens like the How-to popup: a floating card in the flowchart area that
  // shifts aside for the intro panel rather than covering the whole screen.
  top: 120px;
  left: 50%;
  transform: translateX(-50%);
  width: 340px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 152px);
  overflow-y: auto;
  box-sizing: border-box;
  padding: 22px 24px 20px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 6px 28px rgba(0, 0, 0, 0.16);
  color: rgb(var(--text-color));
  transition: left 0.25s var(--transition-timing);

  &.panel-visible {
    left: calc(50% + var(--panel-width) / 2);
  }
}

.end-close {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: rgba(var(--text-color), 0.6);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;

  &:hover {
    background: rgba(var(--text-color), 0.08);
    color: rgb(var(--text-color));
  }
}

.end-title {
  margin: 0 0 8px;
  padding-right: 28px;
  font-size: 20px;
  font-weight: 600;
  line-height: 115%;
  text-wrap: balance;
}

.end-intro {
  margin: 0 0 18px;
  font-size: 14px;
  line-height: 1.5;
  color: rgba(var(--text-color), 0.85);
}

.end-section {
  margin-bottom: 18px;

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li + li {
    margin-top: 8px;
  }

  a {
    display: inline-block;
    font-size: 15px;
    color: rgb(var(--accent-color));
    text-decoration-color: rgba(var(--accent-color), 0.4);
    text-decoration-thickness: 2px;
    text-underline-offset: 2px;
    transition: color var(--transition-duration) var(--transition-timing);

    &:hover {
      color: rgb(var(--text-color));
    }
  }
}

.end-continue {
  display: block;
  width: 100%;
  height: 40px;
  margin-top: 4px;
  appearance: none;
  border: none;
  border-radius: 999px;
  background: rgb(var(--accent-color));
  color: #fff;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: transform var(--transition-duration) var(--transition-timing);

  &:hover {
    transform: scale(1.02);
  }
}

.end-fade-enter-active,
.end-fade-leave-active {
  transition: opacity 0.25s var(--transition-timing), transform 0.25s var(--transition-timing);
}

.end-fade-enter-from,
.end-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-8px);
}

@media (max-width: 600px) {
  .end-panel.panel-visible {
    left: 50%;
  }
}
</style>
