import { ApiKeyForm } from "@/forms/ApiKeysForm"
import { Button } from "../../components/ui/button"
import { useState } from "react"
import { ImportsForm } from "@/forms/ImportsForm"
import { UserSettingsForm } from "@/forms/UserSettingsForm"

export type Tab = "apiKeys" | "user" | "imports" // Tabs in settings

export default function Settings() {
    const [activeTab, setActiveTab] = useState<Tab>("user")

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex justify-between px-6 pt-6 pb-4 items-center">
                <div>
                    <h1 className="font-display text-4xl font-semibold">Settings</h1>
                </div>
            </div>

            {/* Tab chips below header */}
            <div className="flex flex-wrap gap-2 px-6 pb-2" role="tablist">
                {([["user", "User"], ["apiKeys", "API Keys"], ["imports", "Data Imports"]] as const).map(([tab, label]) => (
                    <Button
                        key={tab}
                        role="tab"
                        aria-selected={activeTab === tab}
                        variant="outline"
                        className={`h-9 rounded-full border-border-strong px-4 font-normal ${
                            activeTab === tab ? "bg-card text-foreground font-semibold" : "bg-transparent text-muted-foreground"
                        }`}
                        onClick={() => setActiveTab(tab)}
                    >
                        {label}
                    </Button>
                ))}
            </div>

            {/* Main content */}
            <div className="flex-1 p-4 overflow-y-auto min-h-0 scrollbar-hide">
                {activeTab === "apiKeys" && <ApiKeyForm />}
                {activeTab === "user" && <UserSettingsForm />}
                {activeTab === "imports" && <ImportsForm />}
            </div>
        </div>
    )
}
