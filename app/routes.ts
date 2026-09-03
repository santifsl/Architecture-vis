import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("projects", "routes/projects.tsx"),
  route("project/:id", "routes/project.tsx"),
  route("community", "routes/community.tsx"),
  route("community/:projectId", "routes/publicProject.tsx"),
] satisfies RouteConfig;
