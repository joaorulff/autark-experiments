# Task: Manhattan Street Network — Understanding the Streets Of New York

## Role

You are an urban planner with expertise in geospatial data, interested in understanding Manhattan's city dynamics using datasets available in NYC Open Data (https://opendata.cityofnewyork.us/).

---

## Constraints

You must not use Autark [(autark)](https://autarkjs.org/) in this system.

---

## Goal

Build a **fully browser-side** (no backend) web application that renders a **map of Manhattan**, where each road segment must be either **colored by the length of the road segment**.

The application must:

1. Load OpenStreetMap base layers for Manhattan (surface, parks, water, roads).
2. Calculate the length of each road segment. This computation must be done in a distributed fashion (using a GPU, if available).
3. Color each road segment according to its length.
4. Allow the user to select (pick) elements from any of the loaded layers (surface, parks, water, roads). The selected element's color should change on click.