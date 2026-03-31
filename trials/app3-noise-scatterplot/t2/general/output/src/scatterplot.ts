import * as d3 from 'd3';
import type { BuildingFeature } from './types';

export interface ScatterplotCallbacks {
  onBrush: (selectedIds: Set<number>) => void;
}

export function createScatterplot(
  container: HTMLElement,
  buildings: BuildingFeature[],
  callbacks: ScatterplotCallbacks,
  colorFn: (noiseCount: number) => [number, number, number, number]
) {
  console.log('Creating scatterplot...');

  const margin = { top: 20, right: 20, bottom: 50, left: 60 };
  const rect = container.getBoundingClientRect();
  const width = rect.width - margin.left - margin.right;
  const height = rect.height - margin.top - margin.bottom;

  // Clear existing
  d3.select(container).selectAll('*').remove();

  const svg = d3
    .select(container)
    .append('svg')
    .attr('width', rect.width)
    .attr('height', rect.height);

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  // Filter buildings with some data
  const data = buildings.filter((b) => b.properties.area > 0);

  const xMax = d3.max(data, (d) => d.properties.noiseCount) || 1;
  const yMax = d3.max(data, (d) => d.properties.area) || 1;

  const x = d3.scaleLinear().domain([0, xMax]).range([0, width]).nice();
  const y = d3.scaleLinear().domain([0, yMax]).range([height, 0]).nice();

  // Axes
  g.append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(6))
    .selectAll('text')
    .attr('fill', '#aaa');

  g.append('g')
    .call(d3.axisLeft(y).ticks(6).tickFormat((d) => {
      const v = d.valueOf();
      return v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`;
    }))
    .selectAll('text')
    .attr('fill', '#aaa');

  // Style axis lines
  g.selectAll('.domain, .tick line').attr('stroke', '#555');

  // Axis labels
  g.append('text')
    .attr('x', width / 2)
    .attr('y', height + 40)
    .attr('text-anchor', 'middle')
    .attr('fill', '#aaa')
    .attr('font-size', '12px')
    .text('Noise Complaints (within 500m)');

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -height / 2)
    .attr('y', -45)
    .attr('text-anchor', 'middle')
    .attr('fill', '#aaa')
    .attr('font-size', '12px')
    .text('Building Area (m\u00B2)');

  // Draw circles
  const circles = g
    .selectAll('circle')
    .data(data)
    .enter()
    .append('circle')
    .attr('cx', (d) => x(d.properties.noiseCount))
    .attr('cy', (d) => y(d.properties.area))
    .attr('r', 2.5)
    .attr('fill', (d) => {
      const c = colorFn(d.properties.noiseCount);
      return `rgba(${c[0]},${c[1]},${c[2]},0.7)`;
    })
    .attr('stroke', 'none')
    .attr('class', 'scatter-dot');

  // Brush
  const brush = d3
    .brush()
    .extent([
      [0, 0],
      [width, height],
    ])
    .on('brush end', (event: d3.D3BrushEvent<BuildingFeature>) => {
      if (!event.selection) {
        callbacks.onBrush(new Set());
        circles.attr('opacity', 0.7);
        return;
      }

      const [[x0, y0], [x1, y1]] = event.selection as [[number, number], [number, number]];
      const selectedIds = new Set<number>();

      circles.attr('opacity', (d) => {
        const cx = x(d.properties.noiseCount);
        const cy = y(d.properties.area);
        const inBrush = cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
        if (inBrush) selectedIds.add(d.properties.id);
        return inBrush ? 1 : 0.15;
      });

      callbacks.onBrush(selectedIds);
    });

  g.append('g').attr('class', 'brush').call(brush);

  console.log(`Scatterplot created with ${data.length} buildings`);

  // Return update function for highlighting from map
  return {
    highlightBuildings(ids: Set<number>) {
      circles.attr('opacity', (d) => (ids.size === 0 || ids.has(d.properties.id) ? 0.7 : 0.15));
    },
  };
}
