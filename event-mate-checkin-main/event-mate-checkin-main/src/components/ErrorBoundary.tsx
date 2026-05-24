import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in ErrorBoundary:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: "30px", 
          color: "#b91c1c", 
          backgroundColor: "#fef2f2", 
          border: "2px solid #fca5a5", 
          borderRadius: "16px", 
          maxWidth: "500px",
          margin: "40px auto",
          fontFamily: "sans-serif",
          boxShadow: "0 10px 15px -3px rgba(0,0,0,0.05)"
        }}>
          <h2 style={{ fontSize: "20px", fontWeight: "bold", marginBottom: "10px" }}>
            Une erreur critique s'est produite
          </h2>
          <p style={{ color: "#4b5563", fontSize: "14px", marginBottom: "15px" }}>
            L'application a planté. Veuillez faire une capture d'écran de l'erreur ci-dessous et l'envoyer au support.
          </p>
          <details style={{ 
            whiteSpace: "pre-wrap", 
            padding: "15px", 
            backgroundColor: "#ffffff", 
            border: "1px solid #e5e7eb", 
            borderRadius: "8px", 
            fontSize: "12px", 
            color: "#374151",
            fontFamily: "monospace",
            maxHeight: "200px",
            overflowY: "auto"
          }} open>
            <summary style={{ cursor: "pointer", fontWeight: "bold", marginBottom: "5px", outline: "none" }}>
              Détails techniques :
            </summary>
            {this.state.error && this.state.error.toString()}
          </details>
          <button 
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }} 
            style={{ 
              marginTop: "20px", 
              padding: "10px 20px", 
              backgroundColor: "#ef4444", 
              color: "white", 
              border: "none", 
              borderRadius: "8px", 
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: "14px",
              boxShadow: "0 4px 6px -1px rgba(239, 68, 68, 0.2)"
            }}
          >
            Actualiser et Réessayer
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
