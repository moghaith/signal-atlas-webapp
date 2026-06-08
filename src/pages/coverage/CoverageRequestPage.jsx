import { useState } from "react";
import ListView from "./ListView";
import DetailView from "./DetailView";
import CreateView from "./CreateView";
import EditView from "./EditView";
import "./CoverageRequests.css";
import "./CoverageRequestPage.css";

export default function CoverageRequestsPage({ deviceData, apiMode }) {
  // view: "list" | "detail" | "create" | "edit"
  const [view, setView] = useState("list");
  const [selectedId, setSelectedId] = useState(null);

  const goList   = ()       => { setView("list");   setSelectedId(null); };
  const goDetail = (id)     => { setView("detail"); setSelectedId(id);   };
  const goCreate = ()       => { setView("create");                       };
  const goEdit   = (id)     => { setView("edit");   setSelectedId(id);   };

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

      {view === "list"   && <ListView   onSelect={goDetail} onCreate={goCreate} />}
      {view === "detail" && <DetailView id={selectedId} onBack={goList} onEdit={goEdit} />}
      {view === "create" && <CreateView onBack={goList} onCreated={goDetail} deviceData={deviceData} />}
      {view === "edit"   && <EditView   id={selectedId} onBack={() => goDetail(selectedId)} onSaved={() => goDetail(selectedId)} />}
    </main>
  );
}
