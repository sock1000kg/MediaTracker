import { ApiKeyForm } from "@/forms/ApiKeysForm"
import { Button } from "../ui/button"
import { useState } from "react"

export type Tab = "apiKeys" | "user" // Tabs in settings

export default function Settings() {
    const [activeTab, setActiveTab] = useState<Tab>("apiKeys")

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex justify-between p-4 items-center bg-stone-200">
                <div>
                    <p className="text-lg font-semibold">Settings</p>
                    <p className="text-sm text-gray-600">Configure your account</p>
                </div>
            </div>

            {/* Floating buttons below header */}
            <div className="flex gap-2 px-4 py-2 bg-stone-100">
                <Button
                    variant={activeTab === "user" ? "boldedLink" : "link"}
                    className="bg-transparent text-stone-800"
                    onClick={() => setActiveTab("user")}
                >
                    User
                </Button>
                <Button
                    variant={activeTab === "apiKeys" ? "boldedLink" : "link"}
                    className="bg-transparent text-stone-800"
                    onClick={() => setActiveTab("apiKeys")}
                >
                    API Keys
                </Button>
            </div>

            {/* Main content */}
            <div className="flex-1 p-4 overflow-hidden">
                {activeTab === "apiKeys" && <ApiKeyForm />}
                {activeTab === "user" && <p>User settings</p>}
            </div>
        </div>
    )
}
