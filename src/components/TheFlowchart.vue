<template>
  <div ref="container" class="flowchart">
    <div class="loader" :class="{ hidden: flowchartElement, 'panel-visible': viewStore.introPanelVisible }">
      <div class="spinner" />
    </div>
    <InlineSvg
      src="flowchart-6-renamed.svg"
      :class="{ ready: flowchartElement }"
      @loaded="flowchartReady($event)"
    />
  </div>
  <div v-if="flowchartElement" class="bottom-controls" :class="{ 'panel-visible': viewStore.introPanelVisible }">
    <div class="zoom-controls">
      <button class="zoom-btn" title="Zoom out" @click="zoomOut">−</button>
      <input
        class="zoom-slider"
        type="range"
        :min="zoomSliderMin"
        :max="zoomSliderMax"
        step="1"
        :value="currentZoomPercent()"
        @input="setZoomPercent(parseInt($event.target.value))"
      />
      <span class="zoom-readout">{{ currentZoomPercent() }}%</span>
      <button class="zoom-btn" title="Zoom in" @click="zoomIn">+</button>
      <button class="zoom-btn fit" title="Reset to 100%" @click="resetZoom">⤢</button>
    </div>
    <button class="reveal-all-btn" title="Reveal everything so you can explore at your own pace" @click="revealAll">Reveal all</button>
  </div>
</template>

<script>
import { mapStores } from 'pinia';
import { scaleLinear, easeCubicInOut } from 'd3';

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

      // user-controlled zoom multiplier. percentages in the UI are absolute:
      // currentZoomPercent = userZoom × 100. so 100% = userZoom 1.0, always.
      userZoom: 1,
      userZoomMin: 0.2,
      userZoomMax: 8,

      // n-042..n-057 form the "flower" cluster (5 petals + 10 inner segments + Values).
      // Entering it from outside snaps to 64% and centers on the cluster; navigating
      // between flower nodes stays put. Manual zoom changes during the visit override.
      // n-042..n-057 form the petal cluster (5 petals + 10 inner segments + Values).
      flowerNodeIds: [
        'n-042', 'n-043', 'n-044', 'n-045', 'n-046',
        'n-047', 'n-048', 'n-049', 'n-050', 'n-051',
        'n-052', 'n-053', 'n-054', 'n-055', 'n-056', 'n-057'
      ],
      inFlowerMode: false,
      flowerZoomOverridden: false,
      // userZoom snapshot taken right before entering the flower, restored when leaving
      // so the user returns to the same exploration zoom they had before the petal detour.
      preFlowerZoom: null,
      // nodes that snap zoom to fit-the-node-and-its-outgoing on click. used when
      // the next node is far enough away that staying at the same zoom level would
      // crop the destination out of view.
      fitClusterNodeIds: [
        'n-059', 'n-069', 'n-079', 'n-089', 'n-099', 'n-109',
        'n-119', 'n-129', 'n-139', 'n-149', 'n-159', 'n-169'
      ],
      // fixed userZoom used when clicking any case study so all case studies present
      // at the same zoom level (otherwise per-cluster fitting yields different zooms
      // for each because outgoing bboxes vary).
      caseStudyZoom: 2.26,
      // per-node viewport offset overrides: shift the destination off-center.
      // xFactor positive = node appears toward the left of viewport (more right-side
      // visible). yFactor negative = node appears toward the bottom (more up-side visible).
      nodeViewportOffsets: {
        // n-058 ("I wonder what these look like in the real world"): small bias so
        // the destination side (n-035, upper-right) gets a bit more space without
        // pushing n-058 itself off-screen.
        'n-058': { xFactor: 0.08, yFactor: -0.08 }
      },
      // nodes that snap to flower zoom (zoomed-out enough to show the destination across
      // a long curved arrow) and center on the cluster bbox of the node + its outgoing.
      // n-058 → n-035 spans a long diagonal; default zoom is too tight to show both.
      flowerZoomNodeIds: ['n-058'],
      // "passthrough" label nodes: clicking one immediately advances to its outgoing
      // target rather than dwelling on the label itself. Used for the
      // "Keep exploring case studies" labels at each case-study chain ending — they
      // exist as a visual hint but the user shouldn't have to click twice to land
      // on "Looking at lived examples" (n-035).
      passthroughNodeIds: [
        'n-200', 'n-201', 'n-202', 'n-203', 'n-204', 'n-205',
        'n-206', 'n-207', 'n-208', 'n-209', 'n-210', 'n-211'
      ],
      // entry nodes that snap to a fit-zoom over a cluster of children.
      // `fraction` is the share of viewport the cluster bbox should occupy.
      clusterEntryNodes: {
        'n-039': { ids: ['n-059', 'n-069', 'n-079', 'n-089', 'n-099', 'n-109'], fraction: 0.95 },
        'n-040': { ids: ['n-119', 'n-129', 'n-139', 'n-149', 'n-159', 'n-169'], fraction: 0.95 }
      },

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
    },
    // slider range in absolute percentage units (100% = userZoom 1.0).
    zoomSliderMin() {
      return Math.ceil(this.userZoomMin * 100 / 5) * 5;
    },
    zoomSliderMax() {
      return Math.floor(this.userZoomMax * 100 / 5) * 5;
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

      // wheel: scroll = pan (native), Ctrl/⌘+wheel or trackpad pinch (ctrlKey=true) = zoom around cursor
      this.flowchartContainer.addEventListener('wheel', event => {
        if (!event.ctrlKey && !event.metaKey) {
          // let the browser scroll the container natively → panning
          this.$emit('toggleIntroPanel', true);
          return;
        }

        event.preventDefault();
        this.$emit('toggleIntroPanel', true);

        const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
        const containerRect = this.flowchartContainer.getBoundingClientRect();
        const cursorX = event.clientX - containerRect.left;
        const cursorY = event.clientY - containerRect.top;
        this.zoomBy(factor, cursorX, cursorY);
      }, { passive: false });

      // panning/scrolling of flowchart via click-and-drag
      this.flowchartContainer.addEventListener('mousedown', event => {
        // any flowchart interaction closes the intro panel
        this.$emit('toggleIntroPanel', true);

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

        const alternates = this.collectAlternates(nodeId, alternateNodes);
        
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
        const edgeNodes = edgeElement.id.split('-');
        // strip any "_<suffix>" (e.g. "_2" on parallel edges like e-031-032_2) so node lookup still works
        const edgeFrom = 'n-' + edgeNodes[1].split('_')[0];
        const edgeTo = 'n-' + edgeNodes[2].split('_')[0];
        const bidirectionalEdge = edgeNodes.length >= 4 && isNaN(edgeNodes[3]);

        if (!this.flowchartStore.flowchartNodes[edgeFrom] || !this.flowchartStore.flowchartNodes[edgeTo]) {
          console.warn('skipping edge with missing node reference: ' + edgeElement.id);
          return;
        }

        const alternates = this.collectAlternates(edgeElement.id, alternateEdges);

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

      this.removeFrameBackgrounds();
      this.reorderStateFrames();
      this.reorderNodesAboveEdges();
      this.reorderFlowerLayers();
      this.prepareFlowerBaseLayer();
      this.addNodeInteractivity();
      this.fitInitialZoom();
      this.moveToNode(this.flowchartStore.currentNode, false, true);
    },

    // Each Figma state frame exports a full-canvas <rect> as its background. With
    // four frames stacked, the topmost frame's bg covers everything underneath, hiding
    // the alternates that should be revealed via replaced-in. Strip them.
    removeFrameBackgrounds() {
      ['teased', 'current', 'next', 'default'].forEach(state => {
        const frame = this.flowchartElement.querySelector(`g[id="${state}"]`);
        if (!frame) return;
        const firstRect = frame.querySelector(':scope > rect');
        if (firstRect && !firstRect.id) firstRect.remove();
      });
    },

    // Reorder the four state frames so later siblings (rendered on top) follow this
    // priority bottom→top: default, teased, current, next. Next on top so a "next"
    // alternate that overlaps a "current" alternate stays visible.
    reorderStateFrames() {
      ['default', 'teased', 'current', 'next'].forEach(state => {
        const frame = this.flowchartElement.querySelector(`g[id="${state}"]`);
        if (frame && frame.parentNode) frame.parentNode.appendChild(frame);
      });
    },

    // SVG renders later siblings on top. Move every node (default + alternates) to
    // the end of its parent frame so nodes draw above edges, regardless of Figma's
    // export order.
    reorderNodesAboveEdges() {
      const nodes = [...this.flowchartElement.querySelectorAll('[id^=n-]')];
      nodes.forEach(node => node.parentNode.appendChild(node));
    },

    // Tag the flower default primaries so CSS can manage their appearance:
    //   - never-visited petal → painted #523535, text hidden
    //   - visited petal (was current at some point) → default Figma view (gray + text)
    //   - current petal → existing _current alternate replaces the primary
    // We add classes for the petal silhouette path (Union/Vector/Shape) and the text
    // glyph paths so CSS can target them independently.
    prepareFlowerBaseLayer() {
      this.flowerNodeIds.forEach(id => {
        const el = this.flowchartElement.querySelector(`g[id="${id}"]`);
        if (!el) return;
        el.classList.add('flower-default');
        // Classify by fill color rather than id pattern: Figma sometimes nests the
        // petal-silhouette path inside a child <g> (e.g. n-044, n-057) where ids
        // get stripped, so a depth-1 selector or id regex misses them.
        // - fill="#a6a59b" → petal/cell silhouette
        // - fill="#fff"    → text glyph
        el.querySelectorAll('path, circle, ellipse').forEach(shape => {
          const fill = (shape.getAttribute('fill') || '').toLowerCase();
          if (fill === '#a6a59b') {
            shape.classList.add('flower-shape');
          } else if (fill === '#fff' || fill === '#ffffff') {
            shape.classList.add('flower-text-glyph');
          }
        });
      });
    },

    // The 5 outer petals overlap each other and the 11 inner cells fill those overlap
    // regions. Without intervention, an outer petal's state alternate will paint over
    // the inner cells in those regions, hiding labels. Re-append all outer petals
    // first then all inner cells last (across every state) to the SVG root so the
    // inner cells always draw on top of the outer petals regardless of state.
    // Edges between flower nodes go on top of everything so the arrows between petals
    // remain visible.
    reorderFlowerLayers() {
      const outerIds = ['n-042', 'n-043', 'n-044', 'n-045', 'n-046'];
      const innerIds = ['n-047', 'n-048', 'n-049', 'n-050', 'n-051',
                        'n-052', 'n-053', 'n-054', 'n-055', 'n-056', 'n-057'];
      const stateSuffixes = ['', '_teased', '_current', '_next'];
      const flowerNumbers = new Set(
        [...outerIds, ...innerIds].map(id => id.slice(2))
      );

      const moveAll = ids => {
        ids.forEach(id => {
          stateSuffixes.forEach(suffix => {
            const el = this.flowchartElement.querySelector(`[id="${id}${suffix}"]`);
            if (el) this.flowchartElement.appendChild(el);
          });
        });
      };

      moveAll(outerIds);
      moveAll(innerIds);

      // edges connecting two flower nodes: id pattern e-NNN-NNN(_suffix)? where both
      // numeric segments are flower node numbers. lift them above the petals.
      const edges = [...this.flowchartElement.querySelectorAll('[id^=e-]')];
      edges.forEach(edge => {
        const parts = edge.id.split('-');
        if (parts.length < 3) return;
        const fromNum = parts[1].split('_')[0];
        const toNum = parts[2].split('_')[0];
        if (flowerNumbers.has(fromNum) && flowerNumbers.has(toNum)) {
          this.flowchartElement.appendChild(edge);
        }
      });
    },

    // For a primary id, find its state alternates among `alternates`. We look for
    // siblings whose ids match `<primaryId>_<state>` exactly — that prefix-plus-known-state
    // check correctly excludes things like `e-031-032_2_teased` from being mis-attached
    // to `e-031-032`.
    collectAlternates(primaryId, alternates) {
      const known = ['teased', 'revealed', 'next', 'current'];
      const result = {};
      alternates.forEach(alt => {
        for (const state of known) {
          if (alt.id === `${primaryId}_${state}`) {
            result[state] = alt;
            break;
          }
        }
      });
      return result;
    },

    // returns the userZoom that fits the union bbox of `elements` within `fraction`
    // of each viewport axis, clamped to userZoomMin/Max. shared geometry helper used
    // by every snap target so they all behave consistently.
    zoomToFit(elements, fraction = 0.45) {
      const els = elements.filter(Boolean);
      if (!els.length) return this.userZoom;
      const bboxes = els.map(el => el.getBBox());
      const minX = Math.min(...bboxes.map(b => b.x));
      const minY = Math.min(...bboxes.map(b => b.y));
      const maxX = Math.max(...bboxes.map(b => b.x + b.width));
      const maxY = Math.max(...bboxes.map(b => b.y + b.height));
      const w = maxX - minX;
      const h = maxY - minY;
      if (w <= 0 || h <= 0) return this.userZoom;
      const fitX = (this.windowWidth * fraction) / (w * this.zoomScale);
      const fitY = (this.windowHeight * fraction) / (h * this.zoomScale);
      const fit = Math.min(fitX, fitY);
      return Math.min(Math.max(this.userZoomMin, fit), this.userZoomMax);
    },

    // userZoom that fits node + outgoing neighbors into ~45% of the viewport.
    fitZoomToCluster(node) {
      if (!node) return this.userZoom;
      return this.zoomToFit([node.element, ...node.outgoing.map(o => o.node.element)], 0.45);
    },

    fitInitialZoom() {
      const z = this.fitZoomToCluster(this.flowchartStore.currentNode);
      this.userZoom = z;
      this.applyScale();
    },

    // userZoom that fits the entire flower into ~85% of the viewport.
    fitZoomForFlower(fraction = 0.85) {
      const els = this.flowerNodeIds.map(id => this.flowchartStore.flowchartNodes[id]?.element);
      return this.zoomToFit(els, fraction);
    },

    // change userZoom by `factor`, keeping the SVG point under (anchorX, anchorY) — a
    // pixel offset within the container — fixed. anchor defaults to viewport center.
    zoomBy(factor, anchorX, anchorY) {
      const oldZoom = this.userZoom;
      const newZoom = Math.min(Math.max(this.userZoomMin, oldZoom * factor), this.userZoomMax);
      if (newZoom === oldZoom) return;

      // mark as user override so flower auto-snap stops re-applying during this visit
      if (this.inFlowerMode) {
        this.flowerZoomOverridden = true;
      }

      const rect = this.flowchartContainer.getBoundingClientRect();
      const ax = anchorX ?? rect.width / 2;
      const ay = anchorY ?? rect.height / 2;
      const ratio = newZoom / oldZoom;

      this.userZoom = newZoom;
      this.applyScale();

      const marginX = 0.5 * this.windowWidth;
      const marginY = 0.5 * this.windowHeight;
      const svgX = this.flowchartContainer.scrollLeft + ax - marginX;
      const svgY = this.flowchartContainer.scrollTop + ay - marginY;
      this.flowchartContainer.scrollLeft = svgX * ratio + marginX - ax;
      this.flowchartContainer.scrollTop = svgY * ratio + marginY - ay;
    },

    // returns the bbox center of the given nodes plus viewport offsets.
    computeClusterCenter(nodeIds) {
      const els = nodeIds
        .map(id => this.flowchartStore.flowchartNodes[id]?.element)
        .filter(Boolean);
      if (!els.length) return null;

      const bboxes = els.map(el => el.getBBox());
      const minX = Math.min(...bboxes.map(b => b.x));
      const minY = Math.min(...bboxes.map(b => b.y));
      const maxX = Math.max(...bboxes.map(b => b.x + b.width));
      const maxY = Math.max(...bboxes.map(b => b.y + b.height));

      return {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
        xOffsetPx: -(
          this.viewStore.introPanelVisible && this.windowWidth > this.fullWidthIntroPanelThreshold
            ? this.introPanelWidth / 2 - this.horizontalCenterOffset
            : 0
        ),
        yOffsetPx: 0
      };
    },

    // returns { x, y, xOffsetPx, yOffsetPx } describing the flower cluster's center
    // in SVG coordinates and the desired viewport offsets, or null if no flower nodes.
    computeFlowerCenter() {
      const els = this.flowerNodeIds
        .map(id => this.flowchartStore.flowchartNodes[id]?.element)
        .filter(Boolean);
      if (!els.length) return null;

      const bboxes = els.map(el => el.getBBox());
      const minX = Math.min(...bboxes.map(b => b.x));
      const minY = Math.min(...bboxes.map(b => b.y));
      const maxX = Math.max(...bboxes.map(b => b.x + b.width));
      const maxY = Math.max(...bboxes.map(b => b.y + b.height));

      return {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
        xOffsetPx: -(
          this.viewStore.introPanelVisible && this.windowWidth > this.fullWidthIntroPanelThreshold
            ? this.introPanelWidth / 2 - this.horizontalCenterOffset
            : 0
        ),
        // ~centered (slight upward bias)
        yOffsetPx: this.windowHeight * 0.01
      };
    },

    centerOnFlower() {
      const c = this.computeFlowerCenter();
      if (!c) return;
      this.flowchartContainer.scrollTo({
        left: c.x * this.effectiveScale + c.xOffsetPx,
        top: c.y * this.effectiveScale + c.yOffsetPx,
        behavior: 'instant'
      });
    },

    // absolute zoom percentage: 100% = userZoom 1.0.
    currentZoomPercent() {
      return Math.round(this.userZoom * 100);
    },
    setZoomPercent(pct) {
      const target = pct / 100;
      const clamped = Math.min(Math.max(this.userZoomMin, target), this.userZoomMax);
      const factor = clamped / this.userZoom;
      if (factor === 1) return;
      this.zoomBy(factor);
    },
    zoomIn() {
      const pct = this.currentZoomPercent();
      const next = Math.floor(pct / 5) * 5 + 5;
      this.setZoomPercent(next);
    },
    zoomOut() {
      const pct = this.currentZoomPercent();
      const prev = Math.ceil(pct / 5) * 5 - 5;
      this.setZoomPercent(prev);
    },
    // "fit" button: re-fit current node's cluster into the viewport.
    // mark every node + edge as revealed so the user can navigate freely without
    // having to traverse the chain step-by-step. updateAppearance reads the
    // revealedItems list and applies data-state="revealed" to each.
    revealAll() {
      Object.values(this.flowchartStore.flowchartNodes).forEach(node => {
        this.markItemAsRevealed(node.element);
        node.outgoing.forEach(item => this.markItemAsRevealed(item.edge));
      });
      this.updateAppearance();
      this.flowchartStore.saveToLocalStorage?.();
    },

    resetZoom() {
      this.userZoom = this.fitZoomToCluster(this.flowchartStore.currentNode);
      this.applyScale();
      this.moveToNode(this.flowchartStore.currentNode, false, true);
    },

    // attach click listeners to node elements
    addNodeInteractivity() {
      const vueInstance = this;

      Object.entries(this.flowchartStore.flowchartNodes).forEach(([nodeId, node]) => {
        node.element.addEventListener('click', function() {
          // flower petals are always clickable regardless of data-state — the design
          // lets you jump to any petal in any order rather than walking the chain.
          const isFlower = vueInstance.flowerNodeIds.includes(nodeId);
          const nodeClickable = isFlower || ['revealed', 'next', 'current'].includes(this.getAttribute('data-state'));

          // any node interaction (click on a clickable node, or a teased one) closes the
          // intro panel so the user has more room to explore.
          vueInstance.$emit('toggleIntroPanel', true);

          if (nodeClickable) {
            // passthrough labels: skip the label itself and land on its outgoing target.
            if (vueInstance.passthroughNodeIds.includes(nodeId)) {
              const labelNode = vueInstance.flowchartStore.flowchartNodes[nodeId];
              if (labelNode && labelNode.outgoing.length > 0) {
                vueInstance.markItemAsRevealed(labelNode.element);
                const targetId = labelNode.outgoing[0].node.element.id;
                if (targetId !== vueInstance.flowchartStore.currentNodeId) {
                  vueInstance.$emit('setCurrentNodeId', targetId);
                } else {
                  vueInstance.moveToNode(vueInstance.flowchartStore.currentNode, true);
                }
                return;
              }
            }
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
    moveToNode(item, forceMovement = false, instant = false) {
      const isFlowerNode = this.flowerNodeIds.includes(item.element.id);

      if (isFlowerNode) {
        const wasInFlower = this.inFlowerMode;
        this.inFlowerMode = true;
        const flowerZoom = this.fitZoomForFlower();

        // fresh entry from outside: snapshot current zoom so we can restore it on exit,
        // reset override flag, and zoom-animate to flower
        if (!wasInFlower) {
          this.preFlowerZoom = this.userZoom;
          this.flowerZoomOverridden = false;
          const center = this.computeFlowerCenter();
          if (center) {
            this.animateZoomTo(
              flowerZoom,
              center.x,
              center.y,
              center.xOffsetPx,
              center.yOffsetPx
            );
          } else {
            this.userZoom = flowerZoom;
            this.applyScale();
          }
        } else if (!this.flowerZoomOverridden && Math.abs(this.userZoom - flowerZoom) > 0.001) {
          // already in flower and user hasn't overridden, but zoom drifted: re-snap
          this.userZoom = flowerZoom;
          this.applyScale();
        }

        this.updateAppearance();
        return;
      }

      // detect whether we're transitioning out of the flower so we can restore zoom
      const leavingFlower = this.inFlowerMode;
      this.inFlowerMode = false;
      this.flowerZoomOverridden = false;

      // flower-zoom nodes: stay at the flower's zoom level and center on the bbox of
      // [node, ...outgoing]. used when default zoom is too tight to show both endpoints
      // (long curved arrows like n-037 → n-035). per-node offsets layer on top.
      if (this.flowerZoomNodeIds.includes(item.element.id)) {
        // when arriving from the flower, retain the *exact* current userZoom (no
        // recompute) so there's zero perceived zoom drift. Otherwise compute flower fit.
        const targetZoom = leavingFlower ? this.userZoom : this.fitZoomForFlower();
        const ids = [item.element.id, ...item.outgoing.map(o => o.node.element.id)];
        const center = this.computeClusterCenter(ids);
        if (center) {
          const override = this.nodeViewportOffsets[item.element.id];
          const xOff = center.xOffsetPx + this.windowWidth * (override?.xFactor ?? 0);
          const yOff = center.yOffsetPx + this.windowHeight * (override?.yFactor ?? 0);
          if (Math.abs(targetZoom - this.userZoom) > 0.001) {
            this.animateZoomTo(targetZoom, center.x, center.y, xOff, yOff);
          } else {
            this.smoothScroll(
              center.x * this.effectiveScale + xOff,
              center.y * this.effectiveScale + yOff,
              500
            );
          }
          this.updateAppearance();
          return;
        }
      }

      // cluster entry node (e.g. "Explore global examples"): fit the children's
      // bbox into a target fraction of the viewport.
      const clusterCfg = this.clusterEntryNodes[item.element.id];
      if (clusterCfg) {
        const center = this.computeClusterCenter(clusterCfg.ids);
        if (center) {
          const clusterEls = clusterCfg.ids
            .map(id => this.flowchartStore.flowchartNodes[id]?.element)
            .filter(Boolean);
          const targetZoom = this.zoomToFit(clusterEls, clusterCfg.fraction);
          if (Math.abs(targetZoom - this.userZoom) > 0.001) {
            this.animateZoomTo(targetZoom, center.x, center.y, center.xOffsetPx, center.yOffsetPx);
          } else {
            this.smoothScroll(
              center.x * this.effectiveScale + center.xOffsetPx,
              center.y * this.effectiveScale + center.yOffsetPx,
              500
            );
          }
          this.updateAppearance();
          return;
        }
      }

      // determine target zoom:
      //   - leaving flower: restore preFlowerZoom so the user returns to where they were
      //   - fit-cluster nodes (case studies): zoom to fit node + outgoing
      //   - otherwise: keep current zoom
      const oldZoom = this.userZoom;
      let targetZoom = oldZoom;
      if (leavingFlower && this.preFlowerZoom != null) {
        targetZoom = this.preFlowerZoom;
      }
      const isFitCluster = this.fitClusterNodeIds.includes(item.element.id);
      if (isFitCluster) {
        // fixed zoom so every case study lands at the same magnification
        targetZoom = this.caseStudyZoom;
      }

      // for fit-to-cluster nodes, center on the cluster's bbox center so the outgoing
      // neighbors stay visible. otherwise center on the node itself.
      let nodeCenterX, nodeCenterY;
      if (isFitCluster) {
        const ids = [item.element.id, ...item.outgoing.map(o => o.node.element.id)];
        const c = this.computeClusterCenter(ids);
        nodeCenterX = c ? c.x : item.element.getBBox().x;
        nodeCenterY = c ? c.y : item.element.getBBox().y;
      } else {
        const bb = item.element.getBBox();
        nodeCenterX = bb.x + bb.width / 2;
        nodeCenterY = bb.y + bb.height / 2;
      }

      // viewport offset: per-node override > n-017 special case > default.
      const override = this.nodeViewportOffsets[item.element.id];
      const xOffsetFactor = override?.xFactor ?? 0;
      const yOffsetFactor = override?.yFactor
        ?? (item.element.id === 'n-017' ? 0.20 : 0.05);

      const panelOffset = -(
        this.viewStore.introPanelVisible && this.windowWidth > this.fullWidthIntroPanelThreshold
          ? this.introPanelWidth / 2 - this.horizontalCenterOffset
          : 0
      );
      const xOffsetPx = panelOffset + this.windowWidth * xOffsetFactor;
      const yOffsetPx = isFitCluster ? 0 : this.windowHeight * yOffsetFactor;

      const zoomChanged = Math.abs(targetZoom - oldZoom) > 0.001;

      if (!zoomChanged) {
        // no zoom change — smoothly pan to destination (zoom stable so no slide artifact).
        this.userZoom = targetZoom;
        this.applyScale();
        const destLeft = nodeCenterX * this.effectiveScale + xOffsetPx;
        const destTop = nodeCenterY * this.effectiveScale + yOffsetPx;
        if (instant) {
          this.flowchartContainer.scrollTo({ left: destLeft, top: destTop, behavior: 'instant' });
        } else {
          this.smoothScroll(destLeft, destTop, 500);
        }
      } else {
        // zoom changing — animate userZoom over time and recompute scroll each frame
        // so the destination node stays anchored at its target viewport position.
        // No positional sliding — the user just sees a smooth zoom in/out.
        this.animateZoomTo(targetZoom, nodeCenterX, nodeCenterY, xOffsetPx, yOffsetPx);
      }

      this.updateAppearance();
    },

    // animate zoom and pan together over `duration` ms. interpolates the SVG anchor
    // point from "what is currently at viewport center" to the destination point, and
    // userZoom from current → target. yields a single smooth motion (no snap-then-zoom).
    animateZoomTo(targetZoom, destSvgX, destSvgY, destXOffsetPx, destYOffsetPx, duration = 600) {
      const startZoom = this.userZoom;
      const zoomScale = this.zoomScale;
      const startScale = zoomScale * startZoom;
      // SVG point currently at viewport center (= scrollLeft / scale, since margin = 50vw)
      const startSvgX = this.flowchartContainer.scrollLeft / startScale;
      const startSvgY = this.flowchartContainer.scrollTop / startScale;
      const startTime = Date.now();

      const step = () => {
        const elapsed = Date.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const eased = easeCubicInOut(t);

        const z = startZoom + (targetZoom - startZoom) * eased;
        const svgX = startSvgX + (destSvgX - startSvgX) * eased;
        const svgY = startSvgY + (destSvgY - startSvgY) * eased;
        const xOff = destXOffsetPx * eased;
        const yOff = destYOffsetPx * eased;

        this.userZoom = z;
        this.flowchartElement.setAttribute('width', this.flowchartWidth * zoomScale * z);
        this.flowchartElement.setAttribute('height', this.flowchartHeight * zoomScale * z);

        this.flowchartContainer.scrollTo({
          left: svgX * zoomScale * z + xOff,
          top: svgY * zoomScale * z + yOff,
          behavior: 'instant'
        });

        if (t < 1) requestAnimationFrame(step);
      };
      step();
    },

    // smooth scroll to coordinate using custom duration and easing
    smoothScroll(xEnd, yEnd, duration) {
      const time = Date.now();
      const xStart = this.flowchartContainer.scrollLeft;
      const yStart = this.flowchartContainer.scrollTop;

      const step = () => {
        const elapsed = Date.now() - time;
        const scrolling = elapsed < duration;
        const x = scrolling ? xStart + (xEnd - xStart) * easeCubicInOut(elapsed / duration) : xEnd;
        const y = scrolling ? yStart + (yEnd - yStart) * easeCubicInOut(elapsed / duration) : yEnd;

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
        const el = document.getElementById(id);
        if (el) el.setAttribute('data-state', 'teased');
      });

      this.flowchartStore.revealedItems.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.setAttribute('data-state', 'revealed');
      });

      this.flowchartStore.currentNode.outgoing.forEach(item => {
        item.edge.setAttribute('data-state', 'next');
        item.node.element.setAttribute('data-state', 'next');
      });

      const currentEl = this.flowchartStore.currentNode.element;
      currentEl.setAttribute('data-state', 'current');
      this.markItemAsRevealed(currentEl);
      // flower petals: once a petal has been current at any point, mark it visited so
      // it permanently switches from the unvisited #523535 look to the default
      // gray-plus-text view (per design — clicking is what reveals).
      if (this.flowerNodeIds.includes(currentEl.id)) {
        currentEl.classList.add('flower-visited');
      }

      // replace primary elements with alternate state variants if those exist.
      // Flower petals are an exception: only the _current alternate is allowed to
      // replace their primary. teased/next/revealed states keep the primary showing
      // (which the CSS paints #523535 when unvisited, default gray+text once
      // visited) so there's no "next preview" color anywhere on the flower.
      ['teased', 'revealed', 'next', 'current'].forEach(state => {
        this.flowchartElement.querySelectorAll('[data-state=' + state +']').forEach(element => {
          if (this.flowerNodeIds.includes(element.id) && state !== 'current') return;

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

  .loader {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    pointer-events: none;
    background: rgb(var(--background-color));
    transition: opacity 0.25s var(--transition-timing), visibility 0.25s var(--transition-timing), left 0.25s var(--transition-timing);

    &.panel-visible {
      left: var(--panel-width);
    }

    &.hidden {
      opacity: 0;
      visibility: hidden;
    }
  }

  @media (max-width: 600px) {
    .loader.panel-visible {
      left: 0;
    }
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(99, 33, 29, 0.2);
    border-top-color: #63211D;
    border-radius: 50%;
    animation: flowchart-spin 0.8s linear infinite;
  }

  @keyframes flowchart-spin {
    to { transform: rotate(360deg); }
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

    // nodes — scoped to <g> so inner text paths (which Figma exports with the same id
    // as their parent layer, e.g. <path id="n-065_2"> inside <g id="n-065">) aren't
    // hidden by the opacity:0 rule.
    g[id^=n-] {
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

      &[data-state=teased]:not(.flower-default) {
        cursor: not-allowed;
      }

      &[data-state=teased]:not(.replaced-out):not(.flower-default) {
        // solid silhouette: hide text glyphs (always rendered as a direct <path> child),
        // keep the background shape and force a solid black fill
        > path {
          display: none;
        }

        // decorated nodes: <g id="Shape_N"> wraps a path/circle/ellipse with a noise filter
        > [id^="Shape"] {
          filter: none;

          path, circle, ellipse {
            fill: #000;
          }
        }

        // textbox nodes: bare <rect> background
        > rect {
          fill: #000;
        }
      }

      &[data-state=teased]:not(.replaced-out),
      &[data-state=revealed]:not(.replaced-out),
      &[data-state=next]:not(.replaced-out),
      &[data-state=current]:not(.replaced-out),
      &.replaced-in {
        opacity: 1;
      }

      // flower base layer: petals/cells always visible. Until a petal has been
      // visited, it's painted in #523535 with no text glyphs. Once visited (became
      // current at some point), the default Figma view shows (gray + white text).
      &.flower-default:not(.replaced-out) {
        opacity: 1;
        cursor: pointer;
      }

      &.flower-default:not(.flower-visited):not(.replaced-out) {
        .flower-text-glyph {
          display: none;
        }

        .flower-shape {
          fill: #523535;
        }
      }

      // n-057 (Values center) ships from Figma without a stroke. Other petals have
      // a stroke="#fff" stroke-width="10" attribute already; match that, just thinner.
      &[id="n-057"] .flower-shape {
        stroke: #fff;
        stroke-width: 10;
      }

      &.pulse {
        animation: pulse 0.6s 1 backwards ease-in-out;
      }
    }

    // edges
    [id^=e-] {
      opacity: 0;
      pointer-events: none;

      &[data-state=teased]:not(.replaced-out) {
        opacity: 0.2;
      }

      &[data-state=revealed]:not(.replaced-out),
      &[data-state=next]:not(.replaced-out),
      &.replaced-in {
        opacity: 1;
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

.bottom-controls {
  position: fixed;
  z-index: 50;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  transition: left 0.25s var(--transition-timing);

  &.panel-visible {
    left: calc(50% + var(--panel-width) / 2);
  }
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  font-family: inherit;
  font-size: 13px;
  color: rgb(var(--text-color));

  .zoom-btn {
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: inherit;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
      background: rgba(0, 0, 0, 0.06);
    }

    &.fit {
      font-size: 14px;
    }
  }

  .zoom-readout {
    min-width: 48px;
    text-align: center;
    font-variant-numeric: tabular-nums;
    user-select: none;
  }

  .zoom-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 140px;
    height: 4px;
    border-radius: 2px;
    background: rgba(0, 0, 0, 0.15);
    outline: none;
    cursor: pointer;

    &::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #63211D;
      cursor: pointer;
      border: none;
    }

    &::-moz-range-thumb {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #63211D;
      cursor: pointer;
      border: none;
    }
  }
}

.reveal-all-btn {
  height: 40px;
  padding: 0 16px;
  appearance: none;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  color: rgb(var(--text-color));
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 1);
  }
}

@media (max-width: 600px) {
  .bottom-controls.panel-visible {
    left: 50%;
  }
}
</style>