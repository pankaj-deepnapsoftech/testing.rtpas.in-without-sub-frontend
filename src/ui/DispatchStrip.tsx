import React, { useEffect, useState } from "react";
import { axiosHandler } from "../config/axios";
import { useCookies } from "react-cookie";

// Shipment Type
export interface Shipment {
    _id: string;
    party: { _id: string, consignee_name?: [string], company_name?: string };      // Company Name
    product_id: { _id: string, name: string, current_stock: number };   // Product Name
    product_qty: number;
    order_id: string;
    salestatus: String;
    price: number,
    pending_qty?: number

};

enum FilteringTabs {
    All = "All",
    Pending = "Pending",
    Dispatched = "Dispatched"
}


const PartyStrip: React.FC<{ setDispatchData: (data: Shipment) => void, setShowAddDispatch: (val: boolean) => void }> = ({ setDispatchData, setShowAddDispatch }) => {

    const [filtering, setFiltring] = useState<FilteringTabs>(FilteringTabs.All);
    const [shipmentsData, setShipmentsData] = useState<Shipment[]>([]);
    const [totalPage, setTotalPage] = useState<number>(0);
    const [page, setPage] = useState<number>(1);
    const [cookies] = useCookies();

    const getAllSalesDataForDispatch = async () => {
        try {
            const res = await axiosHandler.get(`/sale/sales-dispatch-all?page=${page}&limit=9`, { headers: { Authorization: `Bearer ${cookies.access_token}` } });
            setTotalPage(res.data.totalPage)
            setShipmentsData(res.data.data);
        } catch (error) {
            console.log(error)
        }
    };

    const getAllPendingSalesDataForDispatch = async () => {
        try {
            const res = await axiosHandler.get(`/sale/sales-dispatch-pending?page=${page}&limit=9`, { headers: { Authorization: `Bearer ${cookies.access_token}` } });
            setTotalPage(res.data.totalPage)
            setShipmentsData(res.data.data);
        } catch (error) {
            console.log(error)
        }
    };

    const getAllCompletedSalesDataForDispatch = async () => {
        try {
            const res = await axiosHandler.get(`/sale/sales-dispatch-completed?page=${page}&limit=9`, { headers: { Authorization: `Bearer ${cookies.access_token}` } });
            setShipmentsData(res.data.data);
            setTotalPage(res.data.totalPage)
        } catch (error) {
            console.log(error)
        }
    };

    const HandleDispatch = (data: Shipment) => {
        setDispatchData(data);
        setShowAddDispatch(true)
    }

    useEffect(() => {
        if (filtering === "All") {
            getAllSalesDataForDispatch()
        } else if (filtering === "Pending") {
            getAllPendingSalesDataForDispatch()
        } else if (filtering === "Dispatched") {
            getAllCompletedSalesDataForDispatch()
        }
    }, [filtering, page])

    return (
        <main className="px-6 py-8 bg-slate-50">
            <div className="mx-auto max-w-7xl">

                {/* Header */}
                <div className="mb-8 flex items-center justify-between">
                    <h1 className="text-3xl font-bold text-slate-800">
                        Dispatch Order – Ready for Release
                    </h1>

                    {/* Filter Tabs */}
                    <div className="flex gap-2 rounded-full bg-white border border-slate-200 p-1">
                        {Object.keys(FilteringTabs).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => { setFiltring(tab as FilteringTabs); setPage(1) }}
                                className={`px-6 py-2 text-sm font-medium rounded-full transition-all duration-300 transform ${tab === filtering
                                    ? "bg-blue-500 text-white shadow-md scale-105"
                                    : "text-slate-600 hover:bg-slate-100 hover:scale-105"
                                    }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Shipment Cards */}
                {shipmentsData.length > 0 ? <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {shipmentsData.map((shipment) => (
                        <div
                            key={shipment._id}
                            className="flex flex-col rounded-2xl border bg-white shadow-md transition-all duration-300 transform hover:shadow-lg hover:-translate-y-1"
                        >
                            {/* Card Header */}
                            <div className="flex items-start justify-between px-5 pt-5">
                                <div>
                                    <h3 className="text-lg font-semibold text-slate-800">{shipment.party.consignee_name?.[0] || shipment.party.company_name}</h3>
                                    <p className="text-sm text-slate-500">Product: {shipment.product_id?.name}</p>
                                    <p className="text-xs text-slate-400">ID: {shipment.order_id}</p>
                                </div>

                                <div className={`flex items-center gap-2 rounded-full  px-3 py-1.5 border  transition-all duration-300 transform hover:scale-110 ${shipment.salestatus === "Production Completed" ? "border-amber-200 bg-amber-50" : "bg-green-100 border-green-300"}`}>
                                    <span className={`h-2 w-2 rounded-full  ${shipment.salestatus === "Production Completed" ? "bg-amber-400" : "bg-green-500"}`}></span>
                                    <span className="text-xs font-semibold text-amber-700">{shipment.salestatus === "Production Completed" ? "Pending" : "Dispatched"}</span>
                                </div>
                            </div>

                            {/* Stats Grid */}
                            <div className="mt-5 grid grid-cols-2 gap-4 px-5">
                                {/* Quantity */}
                                <div className="rounded-xl bg-blue-50 p-4 text-center border border-blue-100 transition-all duration-300 transform hover:scale-105 hover:shadow-md">
                                    <p className="text-xs font-semibold text-slate-500">QUANTITY</p>
                                    <p className="mt-2 text-3xl font-bold text-blue-600">{shipment?.pending_qty || shipment.product_qty}</p>
                                    <p className="text-xs text-slate-400 mt-1">units</p>
                                </div>

                                {/* Status Progress */}
                                <div className="rounded-xl bg-emerald-50 p-4 border border-emerald-100 transition-all duration-300 transform hover:scale-105 hover:shadow-md">
                                    <p className="text-xs font-semibold text-slate-500">STATUS</p>
                                    <div className="mt-3 h-2.5 w-full rounded-full bg-emerald-200 overflow-hidden">
                                        <div
                                            className="h-full bg-emerald-500 transition-all duration-500"
                                            style={{ width: `${100}%` }}
                                        />
                                    </div>
                                    <p className="text-xs text-emerald-700 font-medium mt-2">{100}% complete</p>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="mt-5 flex items-center gap-3 border-t border-slate-100 px-5 py-4">
                                {shipment.salestatus === "Production Completed" && <button onClick={() => HandleDispatch(shipment)} className="flex-1 rounded-lg bg-blue-500 px-4 py-2.5 text-sm font-bold text-white shadow-md transition-all duration-300 transform hover:bg-blue-600 hover:shadow-lg hover:scale-105">
                                    DISPATCH NOW
                                </button>}

                            </div>
                        </div>
                    ))}
                </div> : <div className="flex flex-col items-center justify-center min-h-96 bg-white rounded-xl border border-slate-200 p-8">
                    <div className="text-6xl mb-4">📦</div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-2">
                        No Orders Dispatched
                    </h2>
                    <p className="text-slate-600 text-center max-w-xs mb-6">
                        You don't have any orders dispatched yet. Start by creating a new order to get started.
                    </p>

                </div>}

                {shipmentsData.length > 0 && <div className="flex items-center justify-center gap-2 py-6">

                    {/* Prev */}
                    <button onClick={() => page > 1 && setPage((prev) => prev - 1)} className="px-3 py-1 rounded-md border text-sm 
                         hover:bg-gray-100 transition">
                        Prev
                    </button>

                    {/* Page Numbers */}
                    {Array.from({ length: totalPage }).map((_, ind) => {
                        const pageNum = ind + 1;
                        return (
                            <button
                                key={ind}
                                onClick={() => setPage(pageNum)}
                                className={`px-3 py-1 rounded-md text-sm border 
        ${page === pageNum ? "bg-blue-600 text-white" : "bg-white text-blue-600"}`}
                            >
                                {pageNum}
                            </button>
                        );
                    })}



                    {/* Next */}
                    <button onClick={() => totalPage > page && setPage((prev) => prev + 1)} className="px-3 py-1 rounded-md border text-sm 
                         hover:bg-gray-100 transition">
                        Next
                    </button>

                </div>}

            </div>
        </main>
    );
};

export default PartyStrip;
