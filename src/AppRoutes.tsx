import { Routes, Route } from "react-router-dom";
import { HiringApp } from "../ai_hiring_app";
import { AdvertisingLayout } from "./pages/advertising/AdvertisingLayout";
import { AdvertisingHome } from "./pages/advertising/AdvertisingHome";
import { BlogIndex } from "./pages/advertising/BlogIndex";
import { BlogPost } from "./pages/advertising/BlogPost";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HiringApp />} />
      <Route path="/advertising" element={<AdvertisingLayout />}>
        <Route index element={<AdvertisingHome />} />
        <Route path="blog" element={<BlogIndex />} />
        <Route path="blog/:slug" element={<BlogPost />} />
      </Route>
    </Routes>
  );
}
