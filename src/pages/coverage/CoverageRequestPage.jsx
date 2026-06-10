import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import ListView from "./ListView";
import DetailView from "./DetailView";
import CreateView from "./CreateView";
import EditView from "./EditView";
import "./CoverageRequests.css";
import "./CoverageRequestPage.css";

export default function CoverageRequestsPage({ deviceData, apiMode, openLoginModal }) {
  const { user } = useAuth();
  // view: "list" | "detail" | "create" | "edit"
  const [view, setView] = useState("list");
  const [selectedId, setSelectedId] = useState(null);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);

  const goList   = ()       => { setView("list");   setSelectedId(null); };
  const goDetail = (id)     => { setView("detail"); setSelectedId(id);   };
  const goCreate = ()       => { setView("create");                       };
  const goEdit   = (id)     => { setView("edit");   setSelectedId(id);   };
  const handleCreate = () => {
    if (!user) {
      setShowSignInPrompt(true);
      return;
    }
    goCreate();
  };

  const handleOpenLogin = () => {
    setShowSignInPrompt(false);
    if (openLoginModal) openLoginModal();
  };

  return (
    <main className="page-content cr-page">
      <section className="page-intro">
        <h2>Coverage Requests</h2>
        <p>
          Create and manage crowdsourced data collection requests by defining target
          coverage areas. Participants can complete requests and earn rewards by
          collecting data within the specified locations using the Android app.
        </p>
      </section>

      {view === "list"   && <ListView   onSelect={goDetail} onCreate={handleCreate} />}
      {view === "detail" && <DetailView id={selectedId} onBack={goList} onEdit={goEdit} />}
      {view === "create" && <CreateView onBack={goList} onCreated={goDetail} deviceData={deviceData} />}
      {view === "edit"   && <EditView   id={selectedId} onBack={() => goDetail(selectedId)} onSaved={() => goDetail(selectedId)} />}

      {showSignInPrompt && (
        <div className="cr-overlay" onClick={() => setShowSignInPrompt(false)}>
          <div className="cr-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="cr-dialog-header">
              <h4 className="cr-dialog-title">Sign in required</h4>
            </div>
            <p className="cr-dialog-body">
              Please sign in to create a coverage request.
            </p>
            <div className="cr-dialog-actions">
              <button className="cr-btn cr-btn-secondary" onClick={() => setShowSignInPrompt(false)}>
                Not now
              </button>
              <button className="cr-btn cr-btn-primary" onClick={handleOpenLogin}>
                Sign in
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
