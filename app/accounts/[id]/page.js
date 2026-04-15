"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AppShell from "../../components/AppShell";
import AccountResearch from "../../components/AccountResearch";
import LeadList from "../../components/LeadList";
import LeadDetail from "../../components/LeadDetail";
import ProspectForm from "../../components/ProspectForm";
import { A } from "../../components/ui/palette";

export default function AccountDetailPage() {
  const { id } = useParams();
  const [account, setAccount] = useState(null);
  const [leads, setLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editLead, setEditLead] = useState(null);

  async function load() {
    const res = await fetch(`/api/accounts/${id}`);
    const data = await res.json();
    setAccount(data.account);
    setLeads(data.leads ?? []);
    setLoading(false);
    // Keep selected lead in sync
    if (selectedLead) {
      const updated = data.leads?.find(l => l.id === selectedLead.id);
      if (updated) setSelectedLead(updated);
    }
  }

  useEffect(() => { load(); }, [id]);

  function handleLeadUpdated(updated) {
    setLeads(ls => ls.map(l => l.id === updated.id ? updated : l));
    if (selectedLead?.id === updated.id) setSelectedLead(updated);
  }

  function handleLeadDeleted(leadId) {
    setLeads(ls => ls.filter(l => l.id !== leadId));
    if (selectedLead?.id === leadId) setSelectedLead(null);
  }

  function handleLeadAdded(lead) {
    setShowAddForm(false);
    setEditLead(null);
    setLeads(ls => {
      const exists = ls.find(l => l.id === lead.id);
      return exists ? ls.map(l => l.id === lead.id ? lead : l) : [lead, ...ls];
    });
    setSelectedLead(lead);
  }

  async function toggleTrack() {
    if (!account) return;
    const newValue = account.tracked !== "1";
    const res = await fetch(`/api/accounts/${account.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tracked: newValue, trackReason: "manual" }),
    });
    const data = await res.json();
    if (data.account) setAccount(data.account);
  }

  if (loading) return (
    <AppShell>
      <div style={{ padding: 40, color: A.textMuted, textAlign: "center" }}>Loading…</div>
    </AppShell>
  );

  return (
    <AppShell accountId={id}>
      <div style={{ display: "flex", height: "calc(100vh - 92px)" }}>
        {/* Left: Account Research (30%) */}
        <div style={{
          width: "30%", minWidth: 260, maxWidth: 360,
          borderRight: `1px solid ${A.satellite}`,
          padding: 16, overflowY: "auto",
        }}>
          <AccountResearch
            account={account}
            leads={leads}
            onAccountUpdated={setAccount}
            onToggleTrack={toggleTrack}
          />
        </div>

        {/* Right: Lead list + Lead detail (70%) */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Lead list — top ~40% */}
          <div style={{ borderBottom: `1px solid ${A.satellite}`, height: "40%", minHeight: 180, overflowY: "auto" }}>
            <LeadList
              leads={leads}
              selectedId={selectedLead?.id}
              onSelect={setSelectedLead}
              onAddLead={() => setShowAddForm(true)}
            />
          </div>

          {/* Lead detail — bottom 60% */}
          <div style={{ flex: 1, overflowY: "auto", background: A.white }}>
            {selectedLead ? (
              <LeadDetail
                lead={selectedLead}
                onUpdated={handleLeadUpdated}
                onEdit={lead => { setEditLead(lead); setShowAddForm(true); }}
                onDelete={handleLeadDeleted}
              />
            ) : (
              <div style={{ padding: 40, textAlign: "center", color: A.textMuted, fontSize: 13 }}>
                Select a lead to view details
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add/edit lead form */}
      {showAddForm && (
        <ProspectForm
          defaultCompany={account.company}
          editLead={editLead}
          onClose={() => { setShowAddForm(false); setEditLead(null); }}
          onAdded={handleLeadAdded}
        />
      )}
    </AppShell>
  );
}
