<template>
  <transition name="howto-fade">
    <div
      v-if="viewStore.howToVisible"
      class="howto"
      :class="{ 'panel-visible': viewStore.introPanelVisible }"
      role="dialog"
      aria-label="How to use this flowchart"
    >
      <button class="howto-close" title="Close" @click="dismiss">×</button>

      <h2 class="howto-title">How to use</h2>
      <p class="howto-copy">
        Use your mouse to scroll through this flowchart and click on the next
        node, or click on the panels that are covered to reveal them.
      </p>

      <!-- Self-contained animated walkthrough: a cursor moves onto a covered
           (dark) node, clicks, and the node reveals its content — looping. No
           external file needed. To use a real clip instead, drop "how-to.mp4"
           into /public and swap this block for a <video> element. -->
      <div class="howto-demo" aria-hidden="true">
        <div class="demo-node">
          <span class="demo-line demo-line--1"></span>
          <span class="demo-line demo-line--2"></span>
        </div>
        <span class="demo-ripple"></span>
        <svg class="demo-cursor" viewBox="0 0 24 24" width="22" height="22">
          <path
            d="M5 3l14 7-6 1.6L9.5 18 5 3z"
            fill="#fff"
            stroke="rgb(var(--text-color))"
            stroke-width="1.4"
            stroke-linejoin="round"
          />
        </svg>
      </div>

      <button class="howto-got-it" @click="dismiss">Got it</button>
    </div>
  </transition>
</template>

<script>
import { mapStores } from 'pinia';

import { useViewStore } from '@/stores/ViewStore.js';

export default {
  name: 'TheHowToPopup',

  computed: {
    ...mapStores(useViewStore)
  },

  methods: {
    dismiss() {
      this.viewStore.howToVisible = false;
    },
    // close when the user interacts anywhere outside the popup (but not on the
    // "?" help button, which is what reopens it).
    handleOutsideClick(event) {
      if (!this.viewStore.howToVisible) return;
      if (event.target.closest('.howto')) return;
      if (event.target.closest('.help-btn')) return;
      this.viewStore.howToVisible = false;
    }
  },

  created() {
    // always show on load so it appears on every refresh.
    this.viewStore.howToVisible = true;
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

.howto {
  position: fixed;
  z-index: 90;
  // anchored in the upper area (not dead-center) so the first flowchart nodes
  // stay visible below the popup, with enough top margin to feel deliberate.
  top: 120px;
  left: 50%;
  transform: translateX(-50%);
  width: 340px;
  max-width: calc(100vw - 32px);
  box-sizing: border-box;
  padding: 20px 20px 18px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 6px 28px rgba(0, 0, 0, 0.16);
  font-family: inherit;
  color: rgb(var(--text-color));
  transition: left 0.25s var(--transition-timing);

  // shift out of the way of the intro panel while it's open, mirroring the
  // bottom controls so the popup stays centered over the visible flowchart area.
  &.panel-visible {
    left: calc(50% + var(--panel-width) / 2);
  }
}

.howto-close {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: rgba(var(--text-color), 0.6);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;

  &:hover {
    background: rgba(0, 0, 0, 0.06);
    color: rgb(var(--text-color));
  }
}

.howto-title {
  margin: 0 0 8px;
  padding-right: 24px;
  font-size: 17px;
  font-weight: 600;
}

.howto-copy {
  margin: 0 0 14px;
  font-size: 14px;
  line-height: 1.45;
  color: rgba(var(--text-color), 0.85);
}

// Animated walkthrough scene. A cursor moves onto the covered (dark) node,
// clicks, and the node reveals its text lines, then the loop resets. Every
// element shares the same duration + linear timing so they stay in sync.
$demo-duration: 4.5s;

.howto-demo {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  margin-bottom: 16px;
  border-radius: 10px;
  overflow: hidden;
  background: rgba(var(--text-color), 0.05);
}

.demo-node {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 128px;
  height: 62px;
  margin: -31px 0 0 -64px;
  border-radius: 0; // sharp edges, matching the real flowchart nodes
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 9px;
  padding: 0 16px;
  animation: demo-node-reveal $demo-duration linear infinite;
}

.demo-line {
  height: 7px;
  border-radius: 0;
  background: rgb(var(--accent-color));
  opacity: 0;
  animation: demo-line-in $demo-duration linear infinite;

  &--1 { width: 82%; }
  &--2 { width: 58%; }
}

.demo-ripple {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 46px;
  height: 46px;
  margin: -23px 0 0 -23px;
  border-radius: 50%;
  background: rgba(var(--accent-color), 0.35);
  opacity: 0;
  transform: scale(0);
  animation: demo-ripple $demo-duration linear infinite;
}

.demo-cursor {
  position: absolute;
  top: 50%;
  left: 50%;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
  animation: demo-cursor-move $demo-duration linear infinite;
}

@keyframes demo-node-reveal {
  0%, 44% {
    background: #37302d;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15);
  }
  52%, 88% {
    background: #fff;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12), inset 0 0 0 1.5px rgba(var(--accent-color), 0.35);
  }
  96%, 100% {
    background: #37302d;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15);
  }
}

@keyframes demo-line-in {
  0%, 48% { opacity: 0; }
  58%, 88% { opacity: 1; }
  96%, 100% { opacity: 0; }
}

@keyframes demo-ripple {
  0%, 42% { opacity: 0; transform: scale(0); }
  45% { opacity: 0.5; transform: scale(0.3); }
  62% { opacity: 0; transform: scale(1.9); }
  100% { opacity: 0; transform: scale(1.9); }
}

@keyframes demo-cursor-move {
  0% { transform: translate(52px, 34px) scale(1); opacity: 0; }
  10% { transform: translate(52px, 34px) scale(1); opacity: 1; }
  38% { transform: translate(6px, 4px) scale(1); opacity: 1; }
  44% { transform: translate(6px, 4px) scale(0.82); opacity: 1; }
  50% { transform: translate(6px, 4px) scale(1); opacity: 1; }
  82% { transform: translate(6px, 4px) scale(1); opacity: 1; }
  92% { transform: translate(52px, 34px) scale(1); opacity: 0; }
  100% { transform: translate(52px, 34px) scale(1); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .demo-node,
  .demo-line,
  .demo-ripple,
  .demo-cursor {
    animation: none;
  }
  .demo-node { background: #fff; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12), inset 0 0 0 1.5px rgba(var(--accent-color), 0.35); }
  .demo-line { opacity: 1; }
  .demo-cursor { transform: translate(6px, 4px); opacity: 1; }
  .demo-ripple { opacity: 0; }
}

.howto-got-it {
  display: block;
  width: 100%;
  height: 38px;
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

.howto-fade-enter-active,
.howto-fade-leave-active {
  transition: opacity 0.25s var(--transition-timing), transform 0.25s var(--transition-timing);
}

.howto-fade-enter-from,
.howto-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-8px);
}

@media (max-width: 600px) {
  .howto.panel-visible {
    left: 50%;
  }
}
</style>
