import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "@/components/ErrorBoundary.tsx";
import Index from "./pages/Index.tsx";
import ThankYou from "./pages/ThankYou.tsx";
import Login from "./pages/Login.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import Scanner from "./pages/Scanner.tsx";
import Admin from "./pages/Admin.tsx";
import AdminEvent from "./pages/AdminEvent.tsx";
import Register from "./pages/Register.tsx";
import NotFound from "./pages/NotFound.tsx";
import ClientDashboard from "./pages/ClientDashboard.tsx";

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/inscription/:slug" element={<Register />} />
            <Route path="/merci" element={<ThankYou />} />
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/scanner" element={<Scanner />} />
            <Route path="/scanner/:id" element={<Scanner />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/events/:id" element={<AdminEvent />} />
            <Route path="/dashboard/:eventId" element={<ClientDashboard />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
