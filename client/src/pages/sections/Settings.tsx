import { ApiKeyForm } from "@/forms/ApiKeysForm"
import { Button } from "../../components/ui/button"
import { useState } from "react"
import { ImportsForm } from "@/forms/ImportsForm"

export type Tab = "apiKeys" | "user" | "imports" // Tabs in settings

export default function Settings() {
    const [activeTab, setActiveTab] = useState<Tab>("apiKeys")

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex justify-between p-4 items-center bg-stone-200 border border-b-stone-300">
                <div>
                    <p className="text-lg font-semibold">Settings</p>
                    <p className="text-sm text-gray-600">Configure your account</p>
                </div>
            </div>

            {/* Floating buttons below header */}
            <div className="flex bg-stone-200">
                <Button
                    variant={activeTab === "user" ? "boldedLink" : "link"}
                    className={
                        `bg-transparent text-stone-800 rounded-none 
                        ${activeTab === "user" ? 'bg-stone-100' : 'bg-stone-200'}`
                    }
                    onClick={() => setActiveTab("user")}
                >
                    User
                </Button>
                <Button
                    variant={activeTab === "apiKeys" ? "boldedLink" : "link"}
                    className={
                        `bg-transparent text-stone-800 rounded-none 
                        ${activeTab === "apiKeys" ? 'bg-stone-100' : 'bg-stone-200'}`
                    }
                    onClick={() => setActiveTab("apiKeys")}
                >
                    API Keys
                </Button>
                <Button
                    variant={activeTab === "imports" ? "boldedLink" : "link"}
                    className={
                        `bg-transparent text-stone-800 rounded-none 
                        ${activeTab === "imports" ? 'bg-stone-100' : 'bg-stone-200'}`
                    }
                    onClick={() => setActiveTab("imports")}
                >
                    Data Imports
                </Button>
            </div>

            {/* Main content */}
            <div className="flex-1 p-4 overflow-y-auto min-h-0 scrollbar-hide">
                {activeTab === "apiKeys" && <ApiKeyForm />}
                {activeTab === "user" && <p>User settings</p>}
                {activeTab === "imports" && <ImportsForm />}
            </div>
        </div>
    )
}
