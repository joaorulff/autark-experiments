# Task: Manhattan Street Network — Understanding the Streets Of New York

## Role

You are an urban planner with expertise in geospatial data, interested in understanding Manhattan's city dynamics using datasets available in NYC Open Data (https://opendata.cityofnewyork.us/).

---

## Constraints

A new tool, Autark, is available for researchers to facilitate the construction of urban visual analytics systems. You must only use Autark to implement the functionalities described below. Autark documentation is available locally at /Users/joaorulff/Workspace/autark-experiments/autark-experiments/trials/t10/docs.

---

## Goal

Build a **fully browser-side** (no backend) web application that renders a **map of Manhattan**, where each road segment can be either **colored by the number of noise events within a 10-meter radius** or the **length of the road segment**.

The application must:

1. Load OpenStreetMap base layers for Manhattan (surface, parks, water, roads).
2. Calculate the length of each road segment. This computation must be done in a distributed fashion (using a GPU, if available). This computation must be done entirely using shaders. The geometry of each road segment must be sent to the GPU and used in this computation.
3. Color each road segment according to its length.
4. Allow the user to select (pick) elements from any of the loaded layers (surface, parks, water, roads). The selected element's color should change on click.