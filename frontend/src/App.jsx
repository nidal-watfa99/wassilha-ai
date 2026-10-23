import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useApp } from "./context/AppContext";
import { Toasts, Spinner } from "./components/UI";
import { Layout } from "./components/Layout";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Contacts from "./pages/Contacts";
import Messages from "./pages/Messages";
import AIAssistant from "./pages/AIAssistant";
import Tasks from "./pages/Tasks";
import CalendarPage from "./pages/CalendarPage";
import Documents from "./pages/Documents";
import Insights from "./pages/Insights";
import Products from "./pages/Products";
import Calculator from "./pages/Calculator";
import Settings from "./pages/Settings";
import About from "./pages/About";
import Employees from "./pages/Employees";
import Invoices from "./pages/Invoices";
import MapPage from "./pages/MapPage";
import Business from "./pages/Business";

function PrivateRoute({ children }) {
  const { user, authChecked } = useApp();
  if (!authChecked) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100dvh" }}>
        <Spinner />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { user, authChecked } = useApp();
  return (
    <>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="contacts" element={<Contacts />} />
          <Route path="messages" element={<Messages />} />
          <Route path="ai" element={<AIAssistant />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="documents" element={<Documents />} />
          <Route path="insights" element={<Insights />} />
          <Route path="products" element={<Products />} />
          <Route path="calculator" element={<Calculator />} />
          <Route path="employees" element={<Employees />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="map" element={<MapPage />} />
          <Route path="business" element={<Business />} />
          <Route path="settings" element={<Settings />} />
          <Route path="about" element={<About />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toasts />
    </>
  );
}
