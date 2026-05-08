<template>
  <div ref="container" class="flowchart">
    <InlineSvg
      src="flowchart-3.svg"
      :class="{ ready: flowchartElement }"
      @loaded="flowchartReady($event)"
    />
  </div>
</template>

<script>
import { mapStores } from 'pinia';
import { scaleLinear, easeExpOut } from 'd3';

import InlineSvg from 'vue-inline-svg';

import { useFlowchartStore } from '@/stores/FlowchartStore.js';
import { useViewStore } from '@/stores/ViewStore.js';

export default {
  name: 'TheFlowchart',

  components: {
    InlineSvg
  },

  emits: [
    'setCurrentNodeId',
    'toggleIntroPanel'
  ],

  data() {
    return {
      // flowchart container/svg elements
      flowchartContainer: undefined,
      flowchartElement: undefined,

      // flowchart dimensions
      flowchartWidth: 0,
      flowchartHeight: 0,

      // window dimensions
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      shortestWindowSideLength: Math.min(window.innerWidth, window.innerHeight),

      // flowchart scaling parameters
      scaleParameters: {
        domain: [300, 600],
        range: [0.025, 0.035],
        minReductionFactor: 0.75
      },
      scaleFromWindowSideLength: undefined,

      // coordinates stored during panning/dragging
      panCoordinates: undefined,

      // user-controlled zoom multiplier (scroll-to-zoom)
      userZoom: 1,
      userZoomMin: 0.2,
      userZoomMax: 8,

      // parameters for movement/transitions to nodes
      transitionParameters: {
        screenSizeFactor: 0.15,
        maxTravelThreshold: 256,
        distanceFactor: 1.5,
        minDuration: 500,
        maxDuration: 1000
      },

      // count of how many times teased nodes have been attempted to be clicked
      teasedClickAttempts: 0,
      
      // fixed pixel values
      introPanelWidth: 416,
      fullWidthIntroPanelThreshold: 600,
      horizontalCenterOffset: 24,
    }
  },

  computed: {
    ...mapStores(
      useFlowchartStore,
      useViewStore
    ),
    // calculates scale factor for flowchart element extent based on window dimensions
    zoomScale() {
      return this.scaleFromWindowSideLength(this.shortestWindowSideLength);
    },
    // total scale factor combining window-based scale and user-controlled zoom
    effectiveScale() {
      return this.zoomScale * this.userZoom;
    },
    // calculates travel distance threshold below which no movement happens when a new node becomes active during narration
    travelThreshold() {
      return Math.min(
        this.shortestWindowSideLength * this.transitionParameters.screenSizeFactor,
        this.transitionParameters.maxTravelThreshold
      );
    }
  },

  methods: {
    // apply current effective scale to the rendered SVG element
    applyScale() {
      if (!this.flowchartElement) return;
      this.flowchartElement.setAttribute('width', this.flowchartWidth * this.effectiveScale);
      this.flowchartElement.setAttribute('height', this.flowchartHeight * this.effectiveScale);
    },

    // flowchart inline SVG loaded
    flowchartReady(element) {
      this.flowchartContainer = this.$refs.container;
      this.flowchartElement = element;

      // store initial dimensions of flowchart svg elements for scaling
      const viewBox = element.viewBox.baseVal;
      this.flowchartWidth = viewBox.width;
      this.flowchartHeight = viewBox.height;

      // set window dimension properties and scaled flowchart width and height upon window resize
      window.addEventListener('resize', () => {
        this.windowWidth = window.innerWidth;
        this.windowHeight = window.innerHeight;
        this.shortestWindowSideLength = Math.min(window.innerWidth, window.innerHeight);

        this.applyScale();
      });

      // dispatch resize event to initially set scaled flowchart width and height
      window.dispatchEvent(new Event('resize'));

      // hide intro panel upon touch panning
      this.flowchartContainer.addEventListener('touchmove', () => {
        this.$emit('toggleIntroPanel', true);
      });

      // wheel = zoom around cursor (replaces native scroll-pan); pan still works via click-drag
      this.flowchartContainer.addEventListener('wheel', event => {
        event.preventDefault();

        this.$emit('toggleIntroPanel', true);

        const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
        const oldZoom = this.userZoom;
        const newZoom = Math.min(Math.max(this.userZoomMin, oldZoom * factor), this.userZoomMax);
        if (newZoom === oldZoom) return;

        // anchor zoom on cursor: keep the SVG point under the cursor fixed
        const containerRect = this.flowchartContainer.getBoundingClientRect();
        const cursorX = event.clientX - containerRect.left;
        const cursorY = event.clientY - containerRect.top;
        const ratio = newZoom / oldZoom;

        this.userZoom = newZoom;
        this.applyScale();

        // SVG sits inside scroll-content with 50vw/50vh CSS margin; that margin is fixed,
        // so a point at scrollLeft+cursorX in scroll-content corresponds to (… - 50vw) in SVG space
        const marginX = 0.5 * this.windowWidth;
        const marginY = 0.5 * this.windowHeight;
        const svgX = this.flowchartContainer.scrollLeft + cursorX - marginX;
        const svgY = this.flowchartContainer.scrollTop + cursorY - marginY;
        this.flowchartContainer.scrollLeft = svgX * ratio + marginX - cursorX;
        this.flowchartContainer.scrollTop = svgY * ratio + marginY - cursorY;
      }, { passive: false });

      // panning/scrolling of flowchart via click-and-drag
      this.flowchartContainer.addEventListener('mousedown', event => {
        // only start panning if drag was not initiated above visible node
        if (!event.target.closest('[id^=n-].teased, [id^=n-].revealed, [id^=n-].next, [id^=n-].current')) {
          this.flowchartContainer.classList.add('panning');

          this.panCoordinates = {
            xScroll: this.flowchartContainer.scrollLeft,
            yScroll: this.flowchartContainer.scrollTop,
            xPointer: event.clientX,
            yPointer: event.clientY
          };

          this.flowchartContainer.addEventListener('mousemove', mousemoveHandler);
          this.flowchartContainer.addEventListener('mouseup', mouseupHandler);
        }

        event.preventDefault();
      });

      // scroll flowchart container based on delta between start of drag and current pointer position
      const mousemoveHandler = event => {
        const xDelta = event.clientX - this.panCoordinates.xPointer;
        const yDelta = event.clientY - this.panCoordinates.yPointer;

        this.flowchartContainer.scrollTo({
          left: this.panCoordinates.xScroll - xDelta,
          top: this.panCoordinates.yScroll - yDelta,
          behavior: 'instant'
        });
      };

      // end of panning/dragging
      const mouseupHandler = () => {
        this.panCoordinates = undefined;
        this.flowchartContainer.classList.remove('panning');
        this.flowchartContainer.removeEventListener('mousemove', mousemoveHandler);
        this.flowchartContainer.removeEventListener('mouseup', mouseupHandler);
      };

      this.collectNodes();
    },

    // populate flowchartStore’s flowchartNodes object with nodes from svg source
    collectNodes() {
      const nodes = [...this.flowchartElement.querySelectorAll('[id^=n-]')];
      const primaryNodes = nodes.filter(node => !isNaN(node.id.slice(-1)));
      const alternateNodes = nodes.filter(node => !primaryNodes.includes(node));

      primaryNodes.forEach(nodeElement => {
        const nodeId = nodeElement.id;
        console.log('processing node: ' + nodeId);

        const alternates = {};
        const alternatesArray = alternateNodes.filter(alternateNode => alternateNode.id.startsWith(nodeId));

        alternatesArray.forEach(alternateNode => {
          alternates[alternateNode.id.split('_')[1]] = alternateNode;
        });
        
        this.flowchartStore.flowchartNodes[nodeId] = {
          element: nodeElement,
          alternates,
          outgoing: [],
          incoming: []
        };
      });

      const edges = [...this.flowchartElement.querySelectorAll('[id^=e-]')];
      const primaryEdges = edges.filter(edge => !isNaN(edge.id.slice(-1)));
      const alternateEdges = edges.filter(edge => !primaryEdges.includes(edge));

      primaryEdges.forEach(edgeElement => {
        console.log('processing edge: ' + edgeElement.id);
        const edgeNodes = edgeElement.id.split('-');
        // strip any "_<suffix>" (e.g. "_2" on parallel edges like e-031-032_2) so node lookup still works
        const edgeFrom = 'n-' + edgeNodes[1].split('_')[0];
        const edgeTo = 'n-' + edgeNodes[2].split('_')[0];
        const bidirectionalEdge = edgeNodes.length >= 4 && isNaN(edgeNodes[3]);

        if (!this.flowchartStore.flowchartNodes[edgeFrom] || !this.flowchartStore.flowchartNodes[edgeTo]) {
          console.warn('skipping edge with missing node reference: ' + edgeElement.id);
          return;
        }

        const alternates = {};
        const alternatesArray = alternateEdges.filter(alternateEdge => alternateEdge.id.startsWith(edgeElement.id));

        alternatesArray.forEach(alternateEdge => {
          alternates[alternateEdge.id.split('_')[1]] = alternateEdge;
        });

        this.flowchartStore.flowchartNodes[edgeFrom].outgoing.push({
          edge: edgeElement,
          node: this.flowchartStore.flowchartNodes[edgeTo],
          alternates
        });
        this.flowchartStore.flowchartNodes[edgeTo].incoming.push({
          edge: edgeElement,
          node: this.flowchartStore.flowchartNodes[edgeFrom],
          alternates
        });

        // if edge is bidirectional, additionally add the same edge in reverse to the destination/origin node
        if (bidirectionalEdge) {
          this.flowchartStore.flowchartNodes[edgeTo].outgoing.push({
            edge: edgeElement,
            node: this.flowchartStore.flowchartNodes[edgeFrom],
            alternates
          });
          this.flowchartStore.flowchartNodes[edgeFrom].incoming.push({
            edge: edgeElement,
            node: this.flowchartStore.flowchartNodes[edgeTo],
            alternates
          });
        }
      });

      this.reorderNodesAboveEdges();
      this.addNodeInteractivity();
      this.injectAutoFrames();
      this.fitInitialZoom();
      this.moveToNode(this.flowchartStore.currentNode);
    },

    // SVG renders later siblings on top. Move every primary node group to the end
    // of its parent so nodes draw above edges regardless of Figma's export order.
    reorderNodesAboveEdges() {
      const nodes = [...this.flowchartElement.querySelectorAll('[id^=n-]')];
      const primaryNodes = nodes.filter(node => !isNaN(node.id.slice(-1)));
      primaryNodes.forEach(node => node.parentNode.appendChild(node));
    },

    // for nodes without a <rect> bg or a Shape group, inject a transparent <rect>
    // behind them (used as silhouette in teased and yellow box in current states)
    // and tag the node as .text-only so the default state can color the text instead
    injectAutoFrames() {
      const padding = 64;

      Object.values(this.flowchartStore.flowchartNodes).forEach(node => {
        const el = node.element;
        if (el.querySelector(':scope > rect')) return;
        if (el.querySelector(':scope > g[filter]')) return;

        el.classList.add('text-only');

        const bbox = el.getBBox();
        if (bbox.width === 0 || bbox.height === 0) return;

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', bbox.x - padding);
        rect.setAttribute('y', bbox.y - padding);
        rect.setAttribute('width', bbox.width + padding * 2);
        rect.setAttribute('height', bbox.height + padding * 2);
        rect.setAttribute('fill', 'transparent');
        rect.classList.add('auto-frame');
        el.insertBefore(rect, el.firstChild);
      });
    },

    // pick a starting userZoom such that the current node + its outgoing neighbors
    // (the only items revealed on first load) fit in the viewport with some margin
    fitInitialZoom() {
      const current = this.flowchartStore.currentNode;
      if (!current) return;

      const cluster = [current.element, ...current.outgoing.map(o => o.node.element)];
      const bboxes = cluster.map(el => el.getBBox());

      const minX = Math.min(...bboxes.map(b => b.x));
      const minY = Math.min(...bboxes.map(b => b.y));
      const maxX = Math.max(...bboxes.map(b => b.x + b.width));
      const maxY = Math.max(...bboxes.map(b => b.y + b.height));

      const clusterWidth = maxX - minX;
      const clusterHeight = maxY - minY;
      if (clusterWidth <= 0 || clusterHeight <= 0) return;

      // require the cluster to occupy at most ~45% of each viewport axis
      const targetFraction = 0.45;
      const fitX = (this.windowWidth * targetFraction) / (clusterWidth * this.zoomScale);
      const fitY = (this.windowHeight * targetFraction) / (clusterHeight * this.zoomScale);

      const fitZoom = Math.min(fitX, fitY);
      this.userZoom = Math.min(Math.max(this.userZoomMin, fitZoom), this.userZoomMax);
      this.applyScale();
    },

    // attach click listeners to node elements
    addNodeInteractivity() {
      const vueInstance = this;

      Object.entries(this.flowchartStore.flowchartNodes).forEach(([nodeId, node]) => {
        node.element.addEventListener('click', function() {
          const nodeClickable = ['revealed', 'next', 'current'].includes(this.getAttribute('data-state'));

          if (nodeClickable) {
            if (nodeId !== vueInstance.flowchartStore.currentNodeId) {
              vueInstance.$emit('setCurrentNodeId', nodeId);
            } else {
              vueInstance.moveToNode(vueInstance.flowchartStore.currentNode, true);
            }
          } else if (this.getAttribute('data-state') === 'teased') {
            // if teased node is clicked, trigger the pulse animation for all incoming nodes
            node.incoming.forEach(incomingObject => {
              let incomingNode = incomingObject.node.element;

              if (vueInstance.flowchartStore.revealedItems.includes(incomingNode.id)) {
                incomingNode = vueInstance.findReplacementElement(incomingNode, incomingNode.getAttribute('data-state')) ?? incomingNode;
  
                incomingNode.classList.remove('pulse');
                void incomingNode.getBBox(); // trigger reflow
                incomingNode.classList.add('pulse');
              }
            });

            // display hint alert upon third click attempt
            vueInstance.teasedClickAttempts++;
            if (vueInstance.teasedClickAttempts === 3) {
              alert('In order to reveal this item of the flowchart, please select any item pointing here first.');
            }
          }
        });
      });
    },

    // scroll the flowchart to center on an item
    moveToNode(item, forceMovement = false) {
      const itemPosition = item.element.getBBox();
      const destinationCoords = {
        x: (itemPosition.x + itemPosition.width / 2) * this.effectiveScale - (
          this.viewStore.introPanelVisible && this.windowWidth > this.fullWidthIntroPanelThreshold
            ? this.introPanelWidth / 2 - this.horizontalCenterOffset
            : 0
        ),
        y: (itemPosition.y + itemPosition.height / 2) * this.effectiveScale + this.windowHeight * 0.05
      };

      const currentCoords = {
        x: this.flowchartContainer.scrollLeft,
        y: this.flowchartContainer.scrollTop
      };

      const travelDistance = Math.sqrt(
        Math.pow(currentCoords.x - destinationCoords.x, 2) + Math.pow(currentCoords.y - destinationCoords.y, 2)
      );

      if (forceMovement || travelDistance > this.travelThreshold) {
        const duration = Math.min(
          Math.max(
            travelDistance * this.transitionParameters.distanceFactor,
            this.transitionParameters.minDuration
          ),
          this.transitionParameters.maxDuration
        );

        this.smoothScroll(destinationCoords.x, destinationCoords.y, duration);
      }

      this.updateAppearance();
    },

    // smooth scroll to coordinate using custom duration and easing
    smoothScroll(xEnd, yEnd, duration) {
      const time = Date.now();
      const xStart = this.flowchartContainer.scrollLeft;
      const yStart = this.flowchartContainer.scrollTop;

      const step = () => {
        const elapsed = Date.now() - time;
        const scrolling = elapsed < duration;
        const x = scrolling ? xStart + (xEnd - xStart) * easeExpOut(elapsed / duration) : xEnd;
        const y = scrolling ? yStart + (yEnd - yStart) * easeExpOut(elapsed / duration) : yEnd;

        if (scrolling) {
          requestAnimationFrame(step);
        }

        this.flowchartContainer.scrollTo({
          left: x,
          top: y,
          behavior: 'instant'
        });
      }

      step();
    },

    // update classes/appearance of svg elements
    updateAppearance() {
      // outgoing nodes are iterated over again further down, sequence could be improved
      this.flowchartStore.currentNode.outgoing.forEach(item => {
        this.markItemAsRevealed(item.edge);
        this.markItemAsRevealed(item.node.element);

        item.node.outgoing.forEach(subsequentItem => {
          this.markItemAsTeased(subsequentItem.edge);
          this.markItemAsTeased(subsequentItem.node.element);
        });
      });

      this.flowchartElement.querySelectorAll('[id^=n-], [id^=e-]').forEach(element => {
        element.classList.remove('replaced-out', 'replaced-in');
      });

      this.flowchartStore.teasedItems.forEach(id => {
        document.getElementById(id).setAttribute('data-state', 'teased');
      });

      this.flowchartStore.revealedItems.forEach(id => {
        document.getElementById(id).setAttribute('data-state', 'revealed');
      });

      this.flowchartStore.currentNode.outgoing.forEach(item => {
        item.edge.setAttribute('data-state', 'next');
        item.node.element.setAttribute('data-state', 'next');
      });

      this.flowchartStore.currentNode.element.setAttribute('data-state', 'current');
      this.markItemAsRevealed(this.flowchartStore.currentNode.element);

      // replace primary elements with alternate state variants if those exist
      ['teased', 'revealed', 'next', 'current'].forEach(state => {
        this.flowchartElement.querySelectorAll('[data-state=' + state +']').forEach(element => {
          const replacementElement = this.findReplacementElement(element, state);

          if (replacementElement) {
            element.classList.add('replaced-out');
            replacementElement.classList.add('replaced-in');
          }
        })
      });
    },

    // return replacement for element and certain state if it exists
    findReplacementElement(element, state) {
      return document.getElementById(element.id + '_' + state);
    },

    // add node element to revealedItems array
    markItemAsRevealed(node) {
      if (this.flowchartStore.revealedItems.indexOf(node.id) === -1) {
        this.flowchartStore.revealedItems.push(node.id);
      }
    },

    // add node element to teasedItems array
    markItemAsTeased(node) {
      if (this.flowchartStore.teasedItems.indexOf(node.id) === -1) {
        this.flowchartStore.teasedItems.push(node.id);
      }
    }
  },

  watch: {
    'flowchartStore.currentNodeId'() {
      this.moveToNode(this.flowchartStore.currentNode);
    }
  },

  created() {
    // d3 scaleLinear method to map window dimensions to min/max scale thresholds
    this.scaleFromWindowSideLength = scaleLinear(this.scaleParameters.domain, this.scaleParameters.range).clamp(true);
  }
}
</script>

<style lang="scss">
@import '@/assets/variables.css';

.flowchart {
  position: absolute;
  overflow: auto;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  cursor: grab;
  -webkit-user-select: none;
  user-select: none;
  scrollbar-width: none;
  -ms-overflow-style: none;

  &::-webkit-scrollbar {
    -webkit-appearance: none;
    width: 0;
    height: 0;
  }

  &.panning {
    cursor: grabbing;
  }

  svg {
    opacity: 0;
    visibility: hidden;
    margin: 50vh 50vw;
    transition: opacity 0.25s var(--transition-timing), visibility 0.25s var(--transition-timing);

    &.ready {
      opacity: 1;
      visibility: visible;
    }

    // nodes
    [id^=n-] {
      opacity: 0;
      pointer-events: none;

      &:hover {
        cursor: pointer;
      }

      // primary nodes (ending in a number)
      &[id$='0'],
      &[id$='1'],
      &[id$='2'],
      &[id$='3'],
      &[id$='4'],
      &[id$='5'],
      &[id$='6'],
      &[id$='7'],
      &[id$='8'],
      &[id$='9'] {
        pointer-events: all;
      }

      &[data-state=teased] {
        cursor: not-allowed;
      }

      &[data-state=teased]:not(.replaced-out) {
        // solid silhouette: hide text glyphs (always rendered as a direct <path> child),
        // keep the background shape and force a solid black fill
        > path {
          display: none;
        }

        // decorated nodes: inner <g filter="url(...)"> wraps a gradient-filled shape
        // (Rectangle 1, Shape_N, Union, Vector etc. — anything with a noise filter)
        > g[filter] {
          filter: none;

          rect, path, circle, ellipse {
            fill: #000;
          }
        }

        // textbox nodes: bare <rect> background
        > rect {
          fill: #000;
          rx: 48px;
          ry: 48px;
        }
      }

      &[data-state=teased]:not(.replaced-out),
      &[data-state=revealed]:not(.replaced-out),
      &[data-state=next]:not(.replaced-out),
      &[data-state=current]:not(.replaced-out),
      &.replaced-in {
        opacity: 1;
      }

      // current state: paint the (otherwise-invisible) background rect yellow,
      // and force text glyphs to black (some are natively #FEC70B → invisible on yellow)
      &[data-state=current]:not(.replaced-out) {
        > rect:not([fill^="url"]) {
          fill: #f5c518;
          rx: 48px;
          ry: 48px;
        }
        > path {
          fill: #000;
        }
      }

      // default/revealed state — decorated nodes (Shape groups with yellow gradient
      // fills, e.g. the "How are you feeling…" diamond): flatten to grey, drop noise filter.
      // Option-text nodes: keep bg invisible, just recolor the text glyphs to grey.
      &[data-state=revealed]:not(.replaced-out) {
        > g[filter] {
          filter: none;

          rect, path, circle, ellipse {
            fill: #999891;
          }
        }

        > rect:not([fill^="url"]) ~ path {
          fill: #999891;
        }
      }

      &.pulse {
        animation: pulse 0.6s 1 backwards ease-in-out;
      }
    }

    // edges
    [id^=e-] {
      opacity: 0;
      pointer-events: none;

      &[data-state=teased]:not(.replaced-out),
      &[data-state=revealed]:not(.replaced-out),
      &[data-state=next]:not(.replaced-out),
      &.replaced-in {
        opacity: 1;
      }

      &[data-state=teased][stroke]:not(.replaced-out) {
        stroke: #000;
      }

      &[data-state=teased][fill]:not([fill="none"]):not(.replaced-out) {
        fill: #000;
      }

      &[data-state=next][stroke]:not(.replaced-out) {
        stroke: #f5c518;
      }

      &[data-state=next][fill]:not([fill="none"]):not(.replaced-out) {
        fill: #f5c518;
      }
    }
  }
}

@keyframes pulse {
  0%, 50%, 100% {
    opacity: 1;
  }

  25%, 75% {
    opacity: 0.35;
  }
}
</style>