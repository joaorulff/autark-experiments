/**
 * D3 scatterplot: buildings (x = noise count, y = area).
 * Supports brushing to highlight buildings on the map.
 */

import * as d3 from 'd3';
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import type { BuildingProperties, ScatterPoint } from './types';

let brushCallback: ((ids: Set<number>) => void) | null = null;

export function setBrushCallback(cb: (ids: Set<number>) => void): void {
  brushCallback = cb;
}

export function createScatterplot(
  buildings: FeatureCollection<Polygon | MultiPolygon>
): void {
  console.log('Creating scatterplot...');

  const container = document.getElementById('scatterplot-container')!;
  container.innerHTML = '';

  const margin = { top: 20, right: 20, bottom: 45, left: 60 };
  const width = container.clientWidth - margin.left - margin.right;
  const height = Math.max(container.clientHeight - margin.top - margin.bottom, 200);

  // Prepare data
  const data: ScatterPoint[] = [];
  for (const f of buildings.features) {
    const p = f.properties as BuildingProperties;
    if (p.area > 0) {
      data.push({
        buildingId: p.id,
        noiseCount: p.noiseCount || 0,
        area: p.area,
        x: p.noiseCount || 0,
        y: p.area,
      });
    }
  }

  console.log(`Scatterplot data: ${data.length} points`);

  const xMax = d3.max(data, d => d.x) || 1;
  const yMax = d3.max(data, d => d.y) || 1;

  const xScale = d3.scaleLinear().domain([0, xMax]).range([0, width]).nice();
  const yScale = d3.scaleLinear().domain([0, yMax]).range([height, 0]).nice();

  const svg = d3.select(container)
    .append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom);

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // Axes
  g.append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(xScale).ticks(6))
    .selectAll('text,line,path')
    .attr('stroke', '#666')
    .attr('fill', '#999');

  g.append('g')
    .call(d3.axisLeft(yScale).ticks(6).tickFormat(d => {
      const val = d as number;
      if (val >= 1000) return `${(val / 1000).toFixed(0)}k`;
      return String(val);
    }))
    .selectAll('text,line,path')
    .attr('stroke', '#666')
    .attr('fill', '#999');

  // Axis labels
  g.append('text')
    .attr('x', width / 2)
    .attr('y', height + 38)
    .attr('text-anchor', 'middle')
    .attr('fill', '#999')
    .attr('font-size', '11px')
    .text('Noise Complaints');

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -height / 2)
    .attr('y', -45)
    .attr('text-anchor', 'middle')
    .attr('fill', '#999')
    .attr('font-size', '11px')
    .text('Building Area (m²)');

  // Points
  const circles = g.selectAll('circle')
    .data(data)
    .enter()
    .append('circle')
    .attr('cx', d => xScale(d.x))
    .attr('cy', d => yScale(d.y))
    .attr('r', 2.5)
    .attr('fill', '#e94560')
    .attr('fill-opacity', 0.5)
    .attr('stroke', 'none')
    .attr('class', 'scatter-point');

  // Brush
  const brush = d3.brush()
    .extent([[0, 0], [width, height]])
    .on('brush end', (event: d3.D3BrushEvent<unknown>) => {
      if (!event.selection) {
        // Clear brush → unhighlight all
        circles.attr('fill', '#e94560').attr('fill-opacity', 0.5);
        if (brushCallback) brushCallback(new Set());
        return;
      }

      const [[x0, y0], [x1, y1]] = event.selection as [[number, number], [number, number]];
      const selectedIds = new Set<number>();

      circles.each(function (d: ScatterPoint) {
        const cx = xScale(d.x);
        const cy = yScale(d.y);
        const inBrush = cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;

        if (inBrush) {
          selectedIds.add(d.buildingId);
          d3.select(this).attr('fill', '#00ffff').attr('fill-opacity', 0.9);
        } else {
          d3.select(this).attr('fill', '#e94560').attr('fill-opacity', 0.3);
        }
      });

      console.log(`Scatterplot brush: ${selectedIds.size} buildings selected`);
      if (brushCallback) brushCallback(selectedIds);
    });

  g.append('g')
    .attr('class', 'brush')
    .call(brush);

  console.log('Scatterplot created successfully');
}
