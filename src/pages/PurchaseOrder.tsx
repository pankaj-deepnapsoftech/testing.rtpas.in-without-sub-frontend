import React, { useState, useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  closeAddPurchaseOrderDrawer,
  openAddPurchaseOrderDrawer,
} from "../redux/reducers/drawersSlice";
import { MdOutlineRefresh } from "react-icons/md";
import { FiSearch } from "react-icons/fi";
import { toast } from "react-toastify";
import AddPurchaseOrder from "../components/Drawers/Purchase Order/AddPurchaseOrder";
import PurchaseOrderTable from "../components/Table/PurchaseOrderTable";
import { useCookies } from "react-cookie";
import axios from "axios";

interface PurchaseOrder {
  _id: string;
  poOrder: string;
  date: string;
  itemName: string;
  supplierName: string;
  supplierEmail: string;
  supplierShippedGSTIN: string;
  supplierBillGSTIN: string;
  supplierShippedTo: string;
  supplierBillTo: string;
  modeOfPayment: string;
  GSTApply: string;
  billingAddress: string;
  additionalImportant?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface InventoryShortage {
  _id?: string;
  bom_name: string;
  item_name: string;
  item: string;
  shortage_quantity: number;
  total_required?: number;
  available_stock?: number;
  current_stock: number;
  updated_stock?: number | null;
  original_stock: number;
  original_shortage_quantity?: number; // Store original shortage before updates
  current_price: number;
  updated_price?: number | null;
  price_change?: number;
  price_change_percentage?: number;
  updated_at: string;
  remaining_shortage?: number;
  is_fully_resolved?: boolean;
  is_grouped?: boolean;
  underlying_shortage_ids?: string[]; // Track original shortage IDs when grouped
}

interface ProductInventory {
  _id: string;
  name: string;
  currentStock: number;
  minStockLevel: number;
  maxStockLevel: number;
  unit: string;
}

interface InventoryUpdateForm {
  itemName: string;
  shortageQuantity: number;
  currentStock: number;
  currentPrice: number;
  updatedPrice: number;
  priceChange: number;
  priceChangePercentage: number;
  buyQuantity: number;
  priceDifference: number;
}

// Product Inventory Row Component
const ProductInventoryRow: React.FC<{
  product: ProductInventory;
  onUpdate: (productId: string, newStock: number) => void;
  onUpdateWithShortages: (productId: string, newStock: number) => void;
  isUpdating: boolean;
}> = ({ product, onUpdate, onUpdateWithShortages, isUpdating }) => {
  const [newStock, setNewStock] = useState(product.currentStock);
  const [isEditing, setIsEditing] = useState(false);
  const [useShortageAdjustment, setUseShortageAdjustment] = useState(true);

  const handleSave = () => {
    if (newStock !== product.currentStock) {
      if (useShortageAdjustment) {
        onUpdateWithShortages(product._id, newStock);
      } else {
        onUpdate(product._id, newStock);
      }
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setNewStock(product.currentStock);
    setIsEditing(false);
  };

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        {product.name}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        {product.currentStock}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        {product.minStockLevel}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        {product.maxStockLevel}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        {product.unit}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        {isEditing ? (
          <div className="flex flex-col space-y-2">
            <div className="flex items-center space-x-2">
              <input
                type="number"
                value={newStock}
                onChange={(e) => setNewStock(Number(e.target.value))}
                className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                min="0"
              />
              <button
                onClick={handleSave}
                disabled={isUpdating}
                className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded text-xs disabled:opacity-50"
              >
                {isUpdating ? "Saving..." : "Save"}
              </button>
              <button
                onClick={handleCancel}
                disabled={isUpdating}
                className="bg-gray-600 hover:bg-gray-700 text-white px-2 py-1 rounded text-xs disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id={`shortage-adj-${product._id}`}
                checked={useShortageAdjustment}
                onChange={(e) => setUseShortageAdjustment(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label
                htmlFor={`shortage-adj-${product._id}`}
                className="text-xs text-gray-600"
              >
                Auto-adjust shortages
              </label>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs"
          >
            Edit Stock
          </button>
        )}
      </td>
    </tr>
  );
};

const PurchaseOrder: React.FC = () => {
  const [cookies] = useCookies();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [filteredPurchaseOrders, setFilteredPurchaseOrders] = useState<
    PurchaseOrder[]
  >([]);
  const [searchKey, setSearchKey] = useState("");

  // New state for inventory management
  const [activeTab, setActiveTab] = useState<
    "purchase-orders" | "inventory-shortages" | "update-inventory"
  >("purchase-orders");
  const [inventoryShortages, setInventoryShortages] = useState<
    InventoryShortage[]
  >([]);
  const [isLoadingShortages, setIsLoadingShortages] = useState(false);

  // Modal states
  const [showInventoryShortagesModal, setShowInventoryShortagesModal] =
    useState(false);
  const [showUpdateInventoryModal, setShowUpdateInventoryModal] =
    useState(false);
  const [showEditRawMaterialModal, setShowEditRawMaterialModal] =
    useState(false);
  const [selectedRawMaterial, setSelectedRawMaterial] =
    useState<InventoryShortage | null>(null);
  
  // Track locally edited shortage entries to preserve user edits even after refresh
  const [localShortageEdits, setLocalShortageEdits] = useState<Map<string, { updated_stock?: number | null; updated_price?: number | null }>>(new Map());
  
  // Track direct input values for grouped items to preserve exact user input
  const [groupedItemInputs, setGroupedItemInputs] = useState<Map<string, number | null>>(new Map());

  // Update Inventory Form state
  const [updateInventoryForm, setUpdateInventoryForm] = useState<
    InventoryUpdateForm[]
  >([]);
  const [isLoadingUpdateForm, setIsLoadingUpdateForm] = useState(false);
  const [isSavingChanges, setIsSavingChanges] = useState(false);

  const { isAddPurchaseOrderDrawerOpened } = useSelector(
    (state: any) => state.drawers
  );
  const dispatch = useDispatch();

  // Fetch purchase orders
  const fetchPurchaseOrders = async () => {
    try {
      const response = await axios.get(
        `${process.env.REACT_APP_BACKEND_URL}purchase-order/all`,
        {
          headers: { Authorization: `Bearer ${cookies?.access_token}` },
        }
      );
      if (response.data.success) {
        setPurchaseOrders(response.data.purchase_orders || []);
        setFilteredPurchaseOrders(response.data.purchase_orders || []);
      }
    } catch (error) {
      console.error("Error fetching purchase orders:", error);
    }
  };

  // Fetch inventory shortages (raw materials only)
  const fetchInventoryShortages = async () => {
    setIsLoadingShortages(true);
    try {
      // First fetch all products to get raw materials
      const productsResponse = await axios.get(
        `${process.env.REACT_APP_BACKEND_URL}product/all`,
        {
          headers: { Authorization: `Bearer ${cookies?.access_token}` },
        }
      );

      if (!productsResponse.data.success) {
        toast.error("Failed to fetch products");
        return;
      }

      // Filter for raw materials only
      const rawMaterials = productsResponse.data.products.filter(
        (product: any) =>
          product.category &&
          product.category.toLowerCase().includes("raw material")
      );

      console.log("Raw materials found:", rawMaterials.length);

      // Now fetch inventory shortages
      const shortagesResponse = await axios.get(
        `${process.env.REACT_APP_BACKEND_URL}bom/inventory-shortages`,
        {
          headers: { Authorization: `Bearer ${cookies?.access_token}` },
        }
      );

      if (shortagesResponse.data.success) {
        const allShortages = shortagesResponse.data.shortages || [];

        console.log("All shortages from API:", allShortages);

        // Filter shortages to only include raw materials
        const rawMaterialShortages = allShortages.filter((shortage: any) => {
          // Check if the shortage item is in our raw materials list
          return rawMaterials.some(
            (rawMaterial: any) =>
              rawMaterial.name.toLowerCase() ===
                shortage.item_name?.toLowerCase() ||
              rawMaterial._id === shortage.item
          );
        });

        console.log("Total shortages:", allShortages.length);
        console.log("Raw material shortages:", rawMaterialShortages.length);

        const shortagesWithOriginalStock = rawMaterialShortages.map(
          (shortage: any) => {
            // Preserve local edits if this shortage entry was previously edited
            const shortageId = shortage._id || `${shortage.bom_name}-${shortage.item_name}`;
            const localEdit = localShortageEdits.get(shortageId);
            
            // Treat the backend-provided shortage as the baseline for local remaining calculation
            const originalShortageQty = shortage.shortage_quantity || 0;
            
            return {
              ...shortage,
              original_stock: shortage.current_stock,
              // Store original shortage quantity before any updates (for remaining calculation)
              original_shortage_quantity: originalShortageQty,
              // Use local edit for updated values; ignore backend updated_stock to prevent double subtraction
              updated_price: localEdit?.updated_price !== undefined 
                ? localEdit.updated_price 
                : (shortage.updated_price || null),
              updated_stock: localEdit?.updated_stock !== undefined 
                ? localEdit.updated_stock 
                : null,
            };
          }
        );

        console.log(
          "Raw material shortages count:",
          shortagesWithOriginalStock.length
        );
        console.log("Final shortages data:", shortagesWithOriginalStock);
        setInventoryShortages(shortagesWithOriginalStock);
      } else {
        toast.error(
          shortagesResponse.data.message ||
            "Failed to fetch inventory shortages"
        );
      }
    } catch (error: any) {
      console.error("Error fetching inventory shortages:", error);
      toast.error(
        error?.response?.data?.message || "Failed to fetch inventory shortages"
      );
    } finally {
      setIsLoadingShortages(false);
    }
  };

  // Fetch update inventory form data
  const fetchUpdateInventoryForm = async () => {
    setIsLoadingUpdateForm(true);
    try {
      console.log("Fetching inventory data...");
      console.log("Backend URL:", process.env.REACT_APP_BACKEND_URL);
      console.log("Token:", cookies?.access_token ? "Present" : "Missing");

      // Fetch both inventory shortages and products
      const [shortagesResponse, productsResponse] = await Promise.all([
        axios.get(
          `${process.env.REACT_APP_BACKEND_URL}bom/inventory-shortages`,
          {
            headers: { Authorization: `Bearer ${cookies?.access_token}` },
          }
        ),
        axios.get(`${process.env.REACT_APP_BACKEND_URL}product/all`, {
          headers: { Authorization: `Bearer ${cookies?.access_token}` },
        }),
      ]);

      console.log("Shortages response:", shortagesResponse.data);
      console.log("Products response:", productsResponse.data);

      // Check if at least shortages API is working
      if (shortagesResponse.data.success) {
        const shortages = shortagesResponse.data.shortages || [];
        const products = productsResponse.data.success
          ? productsResponse.data.products || []
          : [];

        console.log("Shortages found:", shortages.length);
        console.log("Products found:", products.length);

        // Filter for raw materials only
        const rawMaterials = products.filter(
          (product: any) =>
            product.category &&
            product.category.toLowerCase().includes("raw material")
        );

        // Filter shortages to only include raw materials
        const rawMaterialShortages = shortages.filter((shortage: any) => {
          return rawMaterials.some(
            (rawMaterial: any) =>
              rawMaterial.name.toLowerCase() ===
                shortage.item_name?.toLowerCase() ||
              rawMaterial._id === shortage.item
          );
        });

        console.log("Total shortages:", shortages.length);
        console.log("Raw material shortages:", rawMaterialShortages.length);

        // Create form data by combining shortages with product info
        const formData = rawMaterialShortages.map(
          (shortage: InventoryShortage) => {
            const product = rawMaterials.find(
              (p: ProductInventory) =>
                p.name.toLowerCase() === shortage.item_name.toLowerCase()
            );

            return {
              itemName: shortage.item_name,
              shortageQuantity: shortage.shortage_quantity,
              currentStock: product
                ? product.currentStock
                : shortage.current_stock,
              currentPrice: shortage.current_price,
              updatedPrice: shortage.current_price,
              priceChange: 0,
              priceChangePercentage: 0,
              buyQuantity: 0, // User will input this
              priceDifference: 0, // User will input this
            };
          }
        );

        console.log("Form data created:", formData);
        setUpdateInventoryForm(formData);

        if (!productsResponse.data.success) {
          toast.warning(
            "Products data not available, but shortages data loaded successfully"
          );
        }
      } else {
        console.error("API responses not successful:", {
          shortages: shortagesResponse.data,
          products: productsResponse.data,
        });
        toast.error(
          "Failed to fetch inventory data - API response not successful"
        );
      }
    } catch (error: any) {
      console.error("Error fetching inventory data:", error);
      console.error("Error response:", error?.response);
      console.error("Error message:", error?.message);

      if (error?.response?.status === 401) {
        toast.error("Authentication failed. Please login again.");
      } else if (error?.response?.status === 404) {
        toast.error("API endpoints not found. Please check the backend URL.");
      } else if (error?.code === "NETWORK_ERROR") {
        toast.error("Network error. Please check your internet connection.");
      } else {
        toast.error(
          error?.response?.data?.message ||
            error?.message ||
            "Failed to fetch inventory data"
        );
      }
    } finally {
      setIsLoadingUpdateForm(false);
    }
  };

  // Handle form input changes
  const handleFormInputChange = (
    index: number,
    field: keyof InventoryUpdateForm,
    value: number
  ) => {

    console.log("th=u===============>>>>>0",value)
    const updatedForm = [...updateInventoryForm];
    const item = updatedForm[index];

    updatedForm[index] = { ...updatedForm[index], [field]: value };
    setUpdateInventoryForm(updatedForm);
  };

  // Handle price updates in Update Inventory form (local only - no API call)
  const handleUpdateInventoryPriceChange = (
    index: number,
    newPrice: number
  ) => {
    const updatedForm = [...updateInventoryForm];
    const item = updatedForm[index];

    updatedForm[index] = {
      ...item,
      updatedPrice: newPrice,
      priceChange: newPrice - item.currentPrice,
      priceChangePercentage:
        ((newPrice - item.currentPrice) / item.currentPrice) * 100,
    };
    setUpdateInventoryForm(updatedForm);
  };

  // Handle stock updates in shortages table (local only - no automatic API call)
  const handleStockUpdate = (itemId: string, newStock: number) => {

    // Check if this is a grouped item by looking it up in groupedShortages
    const groupedItem = groupedShortages.find(
      (item) => String(item.item) === String(itemId) || item.item_name?.toLowerCase() === itemId?.toLowerCase()
    );
    
    
    // If it's a grouped item, update all underlying shortage entries
    if (groupedItem && groupedItem.is_grouped && groupedItem.underlying_shortage_ids) {
      // Store the exact user input for the grouped item
      const groupedKey = String(groupedItem.item || groupedItem.item_name);
      setGroupedItemInputs((prev) => {
        const newInputs = new Map(prev);
        newInputs.set(groupedKey, newStock > 0 ? newStock : null);
        return newInputs;
      });
      
      const updatedShortages = [...inventoryShortages];
      const totalShortage = groupedItem.shortage_quantity;

      const indices = groupedItem.underlying_shortage_ids
        .map((underlyingId: string) =>
          updatedShortages.findIndex(
            (item) => item._id === underlyingId || `${item.bom_name}-${item.item_name}` === underlyingId
          )
        )
        .filter((idx: number) => idx !== -1);

      const entries = indices.map((idx: number) => {
        const u = updatedShortages[idx];
        const share = (newStock * (u.shortage_quantity / totalShortage)) || 0;
        const floorShare = Math.floor(share);
        const frac = share - floorShare;
        return { idx, floorShare, frac };
      });

      const sumFloors = entries.reduce((s, e) => s + e.floorShare, 0);
      let remainder = Math.max(0, newStock - sumFloors);
      entries.sort((a, b) => b.frac - a.frac);
      for (let i = 0; i < entries.length && remainder > 0; i++) {
        entries[i].floorShare += 1;
        remainder -= 1;
      }

      entries.forEach((e) => {
        const underlyingItem = updatedShortages[e.idx];
        const distributedStock = e.floorShare;
        const remainingShortage = Math.max(0, underlyingItem.shortage_quantity - distributedStock);
        const shortageId = underlyingItem._id || `${underlyingItem.bom_name}-${underlyingItem.item_name}`;
        setLocalShortageEdits((prev) => {
          const newEdits = new Map(prev);
          newEdits.set(shortageId, {
            ...newEdits.get(shortageId),
            updated_stock: distributedStock > 0 ? distributedStock : null,
          });
          return newEdits;
        });
        updatedShortages[e.idx] = {
          ...underlyingItem,
          updated_stock: distributedStock,
          remaining_shortage: remainingShortage,
          is_fully_resolved: remainingShortage === 0,
        };
      });
      
      setInventoryShortages(updatedShortages);
      return;
    }
    
    // Original logic for non-grouped items
    const itemIndex = inventoryShortages.findIndex(
      (item) => item._id === itemId || `${item.bom_name}-${item.item_name}` === itemId
    );
    
    if (itemIndex === -1) {
      console.error("Item not found in inventoryShortages:", itemId);
      return;
    }
    
    const updatedShortages = [...inventoryShortages];
    const item = updatedShortages[itemIndex];

    // newStock represents the additional stock to be added
    // Calculate remaining shortage strictly as shortage_quantity − newStock
    const remainingShortage = Math.max(0, (item.shortage_quantity || 0) - newStock);

    // Track this edit locally by shortage ID to preserve it across refreshes
    const shortageId = item._id || `${item.bom_name}-${item.item_name}`;
    setLocalShortageEdits((prev) => {
      const newEdits = new Map(prev);
      const existingEdit = newEdits.get(shortageId) || {};
      newEdits.set(shortageId, {
        ...existingEdit,
        updated_stock: newStock > 0 ? newStock : null,
      });
      return newEdits;
    });

    // Update UI immediately for better user experience
    updatedShortages[itemIndex] = {
      ...item,
      updated_stock: newStock,
      remaining_shortage: remainingShortage, // Add this field to track remaining shortage
      is_fully_resolved: remainingShortage === 0, // Add this field to track if shortage is fully resolved
    };
    setInventoryShortages(updatedShortages);
  };

  // Handle price updates in shortages table (local only - no automatic API call)
  const handlePriceUpdate = (itemId: string, newPrice: number) => {
    // Check if this is a grouped item by looking it up in groupedShortages
    const groupedItem = groupedShortages.find(
      (item) => String(item.item) === String(itemId) || item.item_name?.toLowerCase() === itemId?.toLowerCase()
    );
    
    // If it's a grouped item, update all underlying shortage entries with the same price
    if (groupedItem && groupedItem.is_grouped && groupedItem.underlying_shortage_ids) {
      const updatedShortages = [...inventoryShortages];
      
      // Update all underlying shortage entries with the same price
      groupedItem.underlying_shortage_ids.forEach((underlyingId) => {
        const underlyingIndex = updatedShortages.findIndex(
          (item) => item._id === underlyingId || `${item.bom_name}-${item.item_name}` === underlyingId
        );
        
        if (underlyingIndex !== -1) {
          const underlyingItem = updatedShortages[underlyingIndex];
          
          // Track this edit locally
          const shortageId = underlyingItem._id || `${underlyingItem.bom_name}-${underlyingItem.item_name}`;
          setLocalShortageEdits((prev) => {
            const newEdits = new Map(prev);
            newEdits.set(shortageId, {
              ...newEdits.get(shortageId),
              updated_price: newPrice !== underlyingItem.current_price ? newPrice : null,
            });
            return newEdits;
          });
          
          // Update UI
          updatedShortages[underlyingIndex] = {
            ...underlyingItem,
            updated_price: newPrice,
            price_change: newPrice - underlyingItem.current_price,
            price_change_percentage:
              ((newPrice - underlyingItem.current_price) / underlyingItem.current_price) * 100,
          };
        }
      });
      
      setInventoryShortages(updatedShortages);
      return;
    }
    
    // Original logic for non-grouped items
    const itemIndex = inventoryShortages.findIndex(
      (item) => item._id === itemId || item.item === itemId || `${item.bom_name}-${item.item_name}` === itemId
    );
    
    if (itemIndex === -1) {
      console.error("Item not found in inventoryShortages:", itemId);
      return;
    }
    
    const updatedShortages = [...inventoryShortages];
    const item = updatedShortages[itemIndex];

    // Track this edit locally by shortage ID to preserve it across refreshes
    const shortageId = item._id || `${item.bom_name}-${item.item_name}`;
    setLocalShortageEdits((prev) => {
      const newEdits = new Map(prev);
      const existingEdit = newEdits.get(shortageId) || {};
      newEdits.set(shortageId, {
        ...existingEdit,
        updated_price: newPrice !== item.current_price ? newPrice : null,
      });
      return newEdits;
    });

    // Update UI immediately for better user experience
    updatedShortages[itemIndex] = {
      ...item,
      updated_price: newPrice,
      price_change: newPrice - item.current_price,
      price_change_percentage:
        ((newPrice - item.current_price) / item.current_price) * 100,
    };
    setInventoryShortages(updatedShortages);
  };

  // Submit update inventory form
  const submitUpdateInventoryForm = async () => {
    try {
      // Validate that all buy quantities are sufficient to cover shortages
      const insufficientItems = updateInventoryForm.filter(
        (item) =>
          item.buyQuantity > 0 && item.buyQuantity < item.shortageQuantity
      );

      if (insufficientItems.length > 0) {
        const itemNames = insufficientItems
          .map(
            (item) =>
              `${item.itemName} (${item.buyQuantity}/${item.shortageQuantity})`
          )
          .join(", ");
        toast.error(
          `❌ Submission blocked! Insufficient buy quantities for: ${itemNames}. Buy Quantity must be equal to or greater than Shortage Quantity.`
        );
        return;
      }

      // Here you would typically send the form data to your backend
      console.log("Submitting form data:", updateInventoryForm);
      toast.success("Inventory update form submitted successfully");
      setShowUpdateInventoryModal(false);
    } catch (error: any) {
      toast.error("Failed to submit inventory update form");
    }
  };

  // Open edit raw material modal
  const openEditRawMaterialModal = (item: InventoryShortage) => {
    setSelectedRawMaterial(item);
    setShowEditRawMaterialModal(true);
  };

  // Submit all changes in Raw Material Shortages modal
  const submitRawMaterialChanges = async () => {
    setIsSavingChanges(true);
    try {
      console.log("Total inventory shortages:", inventoryShortages.length);

      // Find items that have been modified
      const itemsWithPriceChanges = inventoryShortages.filter(
        (item) =>
          item.updated_price &&
          item.updated_price !== null &&
          item.updated_price !== item.current_price
      );

      const itemsWithStockChanges = inventoryShortages.filter(
        (item) =>
          item.updated_stock &&
          item.updated_stock !== null &&
          item.updated_stock > 0
      );

      console.log("All inventory shortages:", inventoryShortages);
      console.log("Items with price changes:", itemsWithPriceChanges);
      console.log("Items with stock changes:", itemsWithStockChanges);
      console.log(
        "Items with price changes count:",
        itemsWithPriceChanges.length
      );
      console.log(
        "Items with stock changes count:",
        itemsWithStockChanges.length
      );

      const totalModifiedItems =
        itemsWithPriceChanges.length + itemsWithStockChanges.length;

      if (totalModifiedItems === 0) {
        toast.info("No changes to save");
        return;
      }

      const uniquePriceChanges = new Map<string, number>();
      itemsWithPriceChanges.forEach((item) => {
        if (item.updated_price !== null && item.updated_price !== undefined) {
          uniquePriceChanges.set(item.item, Number(item.updated_price));
        }
      });

      const priceUpdates = Array.from(uniquePriceChanges.entries()).map(
        ([productId, newPrice]) =>
          axios.put(
            `${process.env.REACT_APP_BACKEND_URL}product/update-price`,
            {
              productId,
              newPrice,
            },
            {
              headers: { Authorization: `Bearer ${cookies?.access_token}` },
            }
          )
      );

      // Separate grouped and non-grouped items for stock updates
      const groupedStockUpdates: Map<string, { totalStock: number; itemId: string }> = new Map();
      const nonGroupedStockUpdates: Array<{ shortageId: string; stockToAdd: number }> = [];
      const processedGroupedItemIds = new Set<string>();

      itemsWithStockChanges.forEach((item) => {
        if (!item._id || !item.updated_stock || item.updated_stock <= 0) return;

        // Check if this is a grouped item
        const groupedItem = groupedShortages.find(
          (gi) => String(gi.item) === String(item.item) || gi.item_name?.toLowerCase() === item.item_name?.toLowerCase()
        );

        if (groupedItem && groupedItem.is_grouped) {
          // For grouped items, use the direct user input (exact value)
          const groupedKey = String(groupedItem.item || groupedItem.item_name);
          
          // Skip if we've already processed this grouped item
          if (processedGroupedItemIds.has(groupedKey)) {
            return;
          }
          
          processedGroupedItemIds.add(groupedKey);
          
          const directInput = groupedItemInputs.get(groupedKey);
          
          if (directInput !== undefined && directInput !== null && directInput > 0) {
            // Use exact user input for grouped items
            groupedStockUpdates.set(groupedKey, {
              totalStock: directInput,
              itemId: groupedItem.item,
            });
          }
        } else {
          // For non-grouped items, check if this item is part of a grouped item's underlying shortages
          // If yes, skip it as it will be handled by the grouped item update
          const isUnderlyingItem = groupedShortages.some((gi) => {
            if (gi.is_grouped && gi.underlying_shortage_ids) {
              return gi.underlying_shortage_ids.includes(item._id || '');
            }
            return false;
          });
          
          // Only add if it's not an underlying item of a grouped item
          if (!isUnderlyingItem) {
            nonGroupedStockUpdates.push({
              shortageId: item._id,
              stockToAdd: item.updated_stock,
            });
          }
        }
      });

      // Update grouped items: Add exact total stock directly to product
      const groupedStockUpdateCalls = Array.from(groupedStockUpdates.values()).map(
        ({ totalStock, itemId }) => {
          // First get current stock, then add the exact amount
          return axios.get(
            `${process.env.REACT_APP_BACKEND_URL}product/${itemId}`,
            {
              headers: { Authorization: `Bearer ${cookies?.access_token}` },
            }
          ).then((productResponse) => {
            if (productResponse.data.success) {
              const currentStock = productResponse.data.product.current_stock || 0;
              const newStock = currentStock + totalStock; // Add exact user input
              
              return axios.put(
                `${process.env.REACT_APP_BACKEND_URL}product/update-stock-and-shortages`,
                {
                  productId: itemId,
                  newStock: newStock, // Exact total stock
                },
                {
                  headers: { Authorization: `Bearer ${cookies?.access_token}` },
                }
              );
            }
            throw new Error("Failed to fetch product");
          });
        }
      );

      // Update non-grouped items: Individual shortage updates
      const individualShortageUpdates = nonGroupedStockUpdates.map(({ shortageId, stockToAdd }) =>
        axios.put(
          `${process.env.REACT_APP_BACKEND_URL}product/update-individual-shortage`,
          {
            shortageId: shortageId,
            stockToAdd: stockToAdd, // This is the additional stock to add
          },
          {
            headers: { Authorization: `Bearer ${cookies?.access_token}` },
          }
        )
      );

      // Execute all updates
      await Promise.all([...priceUpdates, ...groupedStockUpdateCalls, ...individualShortageUpdates]);

      const uniqueProductsUpdated = new Set([
        ...Array.from(uniquePriceChanges.keys()),
        ...Array.from(groupedStockUpdates.values()).map((g) => g.itemId),
        ...nonGroupedStockUpdates.map((item) => {
          const shortageItem = itemsWithStockChanges.find((s) => s._id === item.shortageId);
          return shortageItem?.item;
        }).filter(Boolean),
      ]).size;

      const groupedItemsCount = groupedStockUpdates.size;
      const individualShortageEntriesCount = nonGroupedStockUpdates.length;

      toast.success(
        `Successfully updated ${uniqueProductsUpdated} products (${uniquePriceChanges.size} price updates, ${groupedItemsCount} grouped items with exact stock, ${individualShortageEntriesCount} individual shortage entries updated)`
      );

      // Individual shortage updates are now handled by the update-individual-shortage endpoint
      // which automatically handles both fully resolved (shortage = 0) and partially resolved cases
      // So we don't need separate removal/update logic here

      // Clear local edits for processed items after successful submission
      const submittedShortageIds = new Set<string>();
      
      // Add non-grouped items' shortage IDs
      nonGroupedStockUpdates.forEach(({ shortageId }) => {
        submittedShortageIds.add(shortageId);
      });
      
      // Add grouped items' underlying shortage IDs
      groupedStockUpdates.forEach((_, groupedKey) => {
        const groupedItem = groupedShortages.find(
          (gi) => String(gi.item || gi.item_name) === groupedKey
        );
        if (groupedItem && groupedItem.underlying_shortage_ids) {
          groupedItem.underlying_shortage_ids.forEach((id) => {
            submittedShortageIds.add(id);
          });
        }
      });
      
      itemsWithPriceChanges.forEach((item) => {
        if (item._id) {
          submittedShortageIds.add(item._id);
        }
      });
      
      setLocalShortageEdits((prev) => {
        const newEdits = new Map(prev);
        submittedShortageIds.forEach((id) => {
          newEdits.delete(id);
        });
        return newEdits;
      });
      
      // Clear grouped item inputs after successful submission
      setGroupedItemInputs((prev) => {
        const newInputs = new Map(prev);
        groupedStockUpdates.forEach((_, key) => {
          newInputs.delete(key);
        });
        return newInputs;
      });

      // Refresh all data to sync across components
      await Promise.all([
        fetchInventoryShortages(),
        fetchUpdateInventoryForm(),
      ]);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to save changes");
    } finally {
      setIsSavingChanges(false);
    }
  };

  // Clear updated price (optional functionality)
  const clearUpdatedPrice = async (productId: string) => {
    try {
      const response = await axios.put(
        `${process.env.REACT_APP_BACKEND_URL}product/clear-updated-price`,
        {
          productId: productId,
        },
        {
          headers: { Authorization: `Bearer ${cookies?.access_token}` },
        }
      );

      if (response.data.success) {
        toast.success("Updated price cleared successfully");
        // Refresh all data to sync across components
        await Promise.all([
          fetchInventoryShortages(),
          fetchUpdateInventoryForm(),
        ]);
      } else {
        toast.error(response.data.message || "Failed to clear updated price");
      }
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Failed to clear updated price"
      );
    }
  };

  // Clear updated stock (optional functionality)
  const clearUpdatedStock = async (productId: string) => {
    try {
      const response = await axios.put(
        `${process.env.REACT_APP_BACKEND_URL}product/clear-updated-stock`,
        {
          productId: productId,
        },
        {
          headers: { Authorization: `Bearer ${cookies?.access_token}` },
        }
      );

      if (response.data.success) {
        toast.success("Updated stock cleared successfully");
        // Refresh all data to sync across components
        await Promise.all([
          fetchInventoryShortages(),
          fetchUpdateInventoryForm(),
        ]);
      } else {
        toast.error(response.data.message || "Failed to clear updated stock");
      }
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Failed to clear updated stock"
      );
    }
  };

  // Remove item from inventory shortages (when item has been updated)
  const removeFromShortages = async (productId: string) => {
    try {
      const response = await axios.put(
        `${process.env.REACT_APP_BACKEND_URL}product/remove-from-shortages`,
        {
          productId: productId,
        },
        {
          headers: { Authorization: `Bearer ${cookies?.access_token}` },
        }
      );

      if (response.data.success) {
        toast.success(
          `Item removed from shortages (${response.data.deletedShortages} shortages removed)`
        );
        // Refresh all data to sync across components
        await Promise.all([
          fetchInventoryShortages(),
          fetchUpdateInventoryForm(),
        ]);
      } else {
        toast.error(response.data.message || "Failed to remove from shortages");
      }
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Failed to remove from shortages"
      );
    }
  };

  // Update raw material details
  const updateRawMaterial = async (itemId: string, updates: any) => {
    try {
      const response = await axios.put(
        `${process.env.REACT_APP_BACKEND_URL}product/update`,
        {
          _id: itemId,
          ...updates,
        },
        {
          headers: { Authorization: `Bearer ${cookies?.access_token}` },
        }
      );

      if (response.data.success) {
        toast.success("Raw material updated successfully");
        // Refresh all data to sync across components
        await Promise.all([
          fetchInventoryShortages(),
          fetchUpdateInventoryForm(),
        ]);
      } else {
        toast.error("Failed to update raw material");
      }
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Failed to update raw material"
      );
    }
  };

  useEffect(() => {
    fetchPurchaseOrders();
  }, [refreshTrigger]);

  // Filter out fully resolved items (shortage_quantity = 0 and remaining_shortage = 0)
  const activeShortages = useMemo(() => {
    return inventoryShortages.filter((item) => {
      const remainingShortage = item.remaining_shortage !== undefined 
        ? item.remaining_shortage 
        : (item.updated_stock && item.updated_stock > 0 
            ? Math.max(0, item.shortage_quantity - item.updated_stock)
            : item.shortage_quantity);
      return item.shortage_quantity > 0 || remainingShortage > 0;
    });
  }, [inventoryShortages]);

  // Group and combine duplicate raw materials by adding their shortage quantities
  const groupedShortages = useMemo(() => {
    const groupedMap = new Map<string, InventoryShortage>();
    
    activeShortages.forEach((item) => {
      // Use item ID as key for grouping, fallback to item_name if ID not available
      const key = String(item.item || item.item_name?.toLowerCase() || '');
      
      if (!key || key === 'undefined' || key === 'null') return;
      
      const shortageId = item._id || `${item.bom_name}-${item.item_name}`;
      
      if (groupedMap.has(key)) {
        const existing = groupedMap.get(key)!;
        
        // Combine shortage quantities
        const combinedShortage = existing.shortage_quantity + item.shortage_quantity;
        
        // Combine updated stocks if both have them
        const combinedUpdatedStock = (existing.updated_stock || 0) + (item.updated_stock || 0);
        
        // Calculate combined remaining shortage
        const combinedRemainingShortage = Math.max(0, combinedShortage - combinedUpdatedStock);
        
        // Use the most recent updated_at
        const mostRecentUpdate = new Date(existing.updated_at) > new Date(item.updated_at)
          ? existing.updated_at
          : item.updated_at;
        
        // Use the most recent price if different, otherwise keep existing
        const latestPrice = new Date(existing.updated_at) > new Date(item.updated_at)
          ? existing.current_price
          : item.current_price;
        
        // Combine BOM names (show all BOMs this material is used in)
        const combinedBomNames = existing.bom_name 
          ? `${existing.bom_name}, ${item.bom_name || ''}`
          : (item.bom_name || '');
        
        // Track underlying shortage IDs for grouped items
        const existingIds = existing.underlying_shortage_ids || [existing._id || shortageId].filter(Boolean);
        const newIds = item._id ? [item._id] : [shortageId];
        const allUnderlyingIds = [...existingIds, ...newIds];
        
        // Check if there's a direct user input for this grouped item
        const directInput = groupedItemInputs.get(key);
        let finalUpdatedStock: number | null;
        let finalRemainingShortage: number;
        
        if (directInput !== undefined && directInput !== null && directInput > 0) {
          finalUpdatedStock = directInput;
          finalRemainingShortage = Math.max(0, combinedShortage - directInput);
        } else {
          finalUpdatedStock = combinedUpdatedStock > 0 ? combinedUpdatedStock : null;
          finalRemainingShortage = combinedRemainingShortage;
        }
        
        groupedMap.set(key, {
          ...existing,
          shortage_quantity: combinedShortage,
          updated_stock: finalUpdatedStock,
          remaining_shortage: finalRemainingShortage,
          is_fully_resolved: finalRemainingShortage === 0,
          updated_at: mostRecentUpdate,
          current_price: latestPrice,
          bom_name: combinedBomNames,
          is_grouped: true, // Mark as grouped for display purposes
          underlying_shortage_ids: allUnderlyingIds,
        });
      } else {
        // First occurrence, add to map
        // Check if there's a direct user input for this item
        const directInput = groupedItemInputs.get(key);
        let finalUpdatedStock: number | null;
        
        if (directInput !== undefined && directInput !== null && directInput > 0) {
          finalUpdatedStock = directInput;
        } else {
          finalUpdatedStock = item.updated_stock || null;
        }
        
        const finalRemainingShortage = item.remaining_shortage !== undefined 
          ? item.remaining_shortage 
          : (finalUpdatedStock && finalUpdatedStock > 0 
              ? Math.max(0, item.shortage_quantity - finalUpdatedStock)
              : item.shortage_quantity);
        
        groupedMap.set(key, {
          ...item,
          updated_stock: finalUpdatedStock,
          remaining_shortage: finalRemainingShortage,
          is_fully_resolved: finalRemainingShortage === 0,
          underlying_shortage_ids: item._id ? [item._id] : [shortageId],
        });
      }
    });
    
    return Array.from(groupedMap.values());
  }, [activeShortages, groupedItemInputs]);

  // Filter purchase orders based on search key
  useEffect(() => {
    const searchLower = searchKey.toLowerCase();
    const results = purchaseOrders.filter(
      (order: PurchaseOrder) =>
        (order?.poOrder?.toLowerCase() || "").includes(searchLower) ||
        (order?.supplierName?.toLowerCase() || "").includes(searchLower) ||
        (order?.itemName?.toLowerCase() || "").includes(searchLower)
    );
    setFilteredPurchaseOrders(results);
  }, [searchKey, purchaseOrders]);

  // Handle delete purchase order
  const handleDeletePurchaseOrder = (id: string) => {
    setPurchaseOrders((prev) => prev.filter((order) => order._id !== id));
    setFilteredPurchaseOrders((prev) =>
      prev.filter((order) => order._id !== id)
    );
  };

  const openAddPurchaseOrderDrawerHandler = () => {
    dispatch(openAddPurchaseOrderDrawer());
  };

  const closeAddPurchaseOrderDrawerHandler = () => {
    dispatch(closeAddPurchaseOrderDrawer());
    setEditingOrder(null);
  };

  // Handle edit purchase order
  const handleEditPurchaseOrder = (order: PurchaseOrder) => {
    console.log("Edit purchase order clicked:", order);
    setEditingOrder(order);
    dispatch(openAddPurchaseOrderDrawer());
  };

  // Function to refresh table data
  const refreshTableData = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  // Function to handle purchase order creation/update
  const handlePurchaseOrderDataChange = () => {
    refreshTableData();
  };
  return (
    <div className="min-h-screen bg-gray-50 p-2 lg:p-3">
      {isAddPurchaseOrderDrawerOpened && (
        <AddPurchaseOrder
          isOpen={isAddPurchaseOrderDrawerOpened}
          closeDrawerHandler={closeAddPurchaseOrderDrawerHandler}
          edittable={editingOrder}
          fetchPurchaseOrderData={handlePurchaseOrderDataChange}
        />
      )}

      {/* Header Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          {/* Title Section */}
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-3 rounded-xl shadow-lg">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Purchase Order
              </h1>
              <p className="text-gray-600 mt-1">
                Manage purchase orders and inventory
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            {activeTab === "purchase-orders" && (
              <button
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-2 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 flex items-center justify-center gap-2"
                onClick={openAddPurchaseOrderDrawerHandler}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                  />
                </svg>
                Add Purchase
              </button>
            )}

            {/* Raw Material Shortages Button */}
            <button
              className="bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-2 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 flex items-center justify-center gap-2"
              onClick={() => {
                setShowInventoryShortagesModal(true);
                fetchInventoryShortages();
              }}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
              Raw Material Shortages
            </button>

            {/* Update Inventory Button */}
            {/* <button
              className="bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 px-4 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 flex items-center justify-center gap-2"
              onClick={() => {
                setShowUpdateInventoryModal(true);
                // Add a small delay to ensure modal is open before fetching
                setTimeout(() => {
                  fetchUpdateInventoryForm();
                }, 100);
              }}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Update Inventory
            </button> */}

            <button
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 px-4 rounded-lg border border-gray-300 transition-all duration-200 hover:shadow-md flex items-center justify-center gap-2"
              onClick={() => {
                refreshTableData();
              }}
            >
              <MdOutlineRefresh className="text-base" />
              Refresh All
            </button>
          </div>
        </div>

        {/* Search Section */}
        <div className="mt-6 flex justify-center sm:justify-end">
          <div className="relative w-full max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FiSearch className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 shadow-sm"
              placeholder="Search by PO Number, Supplier Name, or Item Name..."
              value={searchKey}
              onChange={(e) => setSearchKey(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <PurchaseOrderTable
          refreshTrigger={refreshTrigger}
          onEdit={handleEditPurchaseOrder}
          filteredPurchaseOrders={filteredPurchaseOrders}
          onDelete={handleDeletePurchaseOrder}
        />
      </div>

      {/* Inventory Shortages Modal */}
      {showInventoryShortagesModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">
                Raw Material Stock Shortages
              </h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={fetchInventoryShortages}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                  disabled={isLoadingShortages}
                >
                  <MdOutlineRefresh
                    className={`text-base ${
                      isLoadingShortages ? "animate-spin" : ""
                    }`}
                  />
                  Refresh
                </button>
                <button
                  onClick={async () => {
                    await Promise.all([
                      fetchInventoryShortages(),
                      fetchUpdateInventoryForm(),
                    ]);
                    toast.success("All data synchronized successfully!");
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Sync All
                </button>
                <button
                  onClick={() => setShowInventoryShortagesModal(false)}
                  className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {isLoadingShortages ? (
                <div className="flex justify-center items-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : groupedShortages.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <h3 className="mt-2 text-sm font-medium text-gray-900">
                    No raw material shortages found
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    All raw material inventory levels are sufficient.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Price Impact Summary */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-blue-900 mb-2">
                      Price & Stock Impact Summary
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-blue-700 font-medium">
                          Total Items:
                        </span>
                        <span className="ml-2 text-blue-900">
                          {groupedShortages.length}
                        </span>
                      </div>
                      <div>
                        <span className="text-blue-700 font-medium">
                          Price Changes:
                        </span>
                        <span className="ml-2 text-blue-900">
                          {
                            groupedShortages.filter(
                              (item) =>
                                item.updated_price &&
                                item.updated_price !== item.current_price
                            ).length
                          }
                        </span>
                      </div>
                      <div>
                        <span className="text-blue-700 font-medium">
                          Stock Changes:
                        </span>
                        <span className="ml-2 text-blue-900">
                          {
                            groupedShortages.filter(
                              (item) =>
                                item.updated_stock && item.updated_stock > 0
                            ).length
                          }
                        </span>
                      </div>
                      <div>
                        <span className="text-blue-700 font-medium">
                          Total Impact:
                        </span>
                        <span
                          className={`ml-2 font-semibold ${
                            groupedShortages.reduce((total, item) => {
                              const change =
                                item.updated_price &&
                                item.updated_price !== null
                                  ? item.updated_price - item.current_price
                                  : 0;
                              const remainingShortage = item.remaining_shortage !== undefined 
                                ? item.remaining_shortage 
                                : (item.updated_stock && item.updated_stock > 0 
                                    ? Math.max(0, item.shortage_quantity - item.updated_stock)
                                    : item.shortage_quantity);
                              return total + change * remainingShortage;
                            }, 0) > 0
                              ? "text-red-600"
                              : "text-green-600"
                          }`}
                        >
                          ₹
                          {groupedShortages
                            .reduce((total, item) => {
                              const change =
                                item.updated_price &&
                                item.updated_price !== null
                                  ? item.updated_price - item.current_price
                                  : 0;
                              const remainingShortage = item.remaining_shortage !== undefined 
                                ? item.remaining_shortage 
                                : (item.updated_stock && item.updated_stock > 0 
                                    ? Math.max(0, item.shortage_quantity - item.updated_stock)
                                    : item.shortage_quantity);
                              return total + change * remainingShortage;
                            }, 0)
                            .toFixed(2)}
                        </span>
                      </div>
                    </div>
                   
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            BOM Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Item Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Total Available Stock
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Updated Stock
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Shortage Quantity
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Remaining Shortage
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Current Price
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Updated Price
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Latest Price
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Price Change
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Last Updated
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {groupedShortages.map((item, idx) => (
                          <tr key={item._id || `${item.bom_name}-${item.item_name}-${idx}`} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {item.bom_name || "-"}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {item.item_name || "-"}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {item.current_stock}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <input
                                type="number"
                                value={
                                  (() => {
                                    // For grouped items, check direct input first
                                    if (item.is_grouped) {
                                      const directInput = groupedItemInputs.get(String(item.item || item.item_name));
                                      if (directInput !== undefined && directInput !== null && directInput > 0) {
                                      console.log("this is my update stock",directInput)
                                        return String(directInput);
                                      }
                                    }
                                    // Otherwise use the item's updated_stock
                                    if (item.updated_stock !== null && item.updated_stock !== undefined && item.updated_stock > 0) {
                                      console.log("this is my update stock",item.updated_stock)
                                      return String(item.updated_stock);
                                    }
                                    return "";
                                  })()
                                }
                                onChange={(e) => {
                                  const inputValue = e.target.value;

                                 
                                  const targetId = item.is_grouped
                                    ? String(item.item || item.item_name)
                                    : (item._id || `${item.bom_name}-${item.item_name}`);
                                  if (inputValue === "" || inputValue === "-") {
                                    handleStockUpdate(targetId, 0);
                                    return;
                                  }
                                  
                                  const cleanValue = inputValue.replace(/[^0-9]/g, '');
                                  
                                  if (cleanValue === "") {
                                    handleStockUpdate(targetId, 0);
                                    return;
                                  }
                                  
                                  const numValue = parseInt(cleanValue, 10);
                                  
                                  if (!isNaN(numValue) && numValue >= 0) {
                                    handleStockUpdate(targetId, numValue);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  // Allow: backspace, delete, tab, escape, enter, decimal point, and numbers
                                  if (
                                    [46, 8, 9, 27, 13, 110, 190].indexOf(e.keyCode) !== -1 ||
                                    // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
                                    (e.keyCode === 65 && e.ctrlKey === true) ||
                                    (e.keyCode === 67 && e.ctrlKey === true) ||
                                    (e.keyCode === 86 && e.ctrlKey === true) ||
                                    (e.keyCode === 88 && e.ctrlKey === true) ||
                                    // Allow: home, end, left, right
                                    (e.keyCode >= 35 && e.keyCode <= 39)
                                  ) {
                                    return;
                                  }
                                  // Ensure that it is a number and stop the keypress
                                  if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
                                    e.preventDefault();
                                  }
                                }}
                                className={`w-28 px-3 py-2 border-2 rounded-md text-sm font-medium cursor-text focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all ${  
                                  item.updated_stock &&
                                  item.updated_stock > 0 &&
                                  item.updated_stock < item.shortage_quantity
                                    ? "border-orange-500 bg-orange-50 text-orange-900"
                                    : item.updated_stock &&
                                      item.updated_stock >=
                                        item.shortage_quantity
                                    ? "border-green-500 bg-green-50 text-green-900"
                                    : "border-blue-300 bg-blue-50 text-gray-900 hover:border-blue-400 hover:bg-blue-100"
                                }`}
                                placeholder="0"
                                min="0"
                                step="1"
                                disabled={false}
                                readOnly={false}
                              />
                              {item.updated_stock && item.updated_stock > 0 && (
                                <div
                                  className={`text-xs mt-1 ${
                                    item.updated_stock < item.shortage_quantity
                                      ? "text-orange-600"
                                      : "text-green-600"
                                  }`}
                                >
                                  {item.updated_stock < item.shortage_quantity
                                    ? `Partial: ${
                                        item.remaining_shortage || 0
                                      } remaining`
                                    : `Complete: +${item.updated_stock}`}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-red-600">
                              {item.shortage_quantity}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              {(() => {
                                // Calculate remaining shortage correctly
                                let remaining: number;
                                
                                if (item.is_grouped) {
                                  // For grouped items, calculate from user input
                                  const directInput = groupedItemInputs.get(String(item.item || item.item_name));
                                  if (directInput !== undefined && directInput !== null && directInput > 0) {
                                    // User has entered stock, calculate remaining
                                    remaining = Math.max(0, item.shortage_quantity - directInput);
                                  } else if (item.remaining_shortage !== undefined) {
                                    // Use stored remaining shortage
                                    remaining = item.remaining_shortage;
                                  } else {
                                    // No update yet, show full shortage
                                    remaining = item.shortage_quantity;
                                  }
                                } else {
                                  // For non-grouped items: strictly shortage_quantity − updated_stock
                                  if (item.updated_stock && item.updated_stock > 0) {
                                    remaining = Math.max(0, (item.shortage_quantity || 0) - (item.updated_stock || 0));
                                  } else {
                                    remaining = item.shortage_quantity;
                                  }
                                }
                                
                                const hasStockUpdate = item.updated_stock && item.updated_stock > 0;
                                
                                return (
                                  <span
                                    className={`font-semibold ${
                                      remaining > 0
                                        ? hasStockUpdate
                                          ? "text-orange-600"
                                          : "text-red-600"
                                        : "text-green-600"
                                    }`}
                                  >
                                    {remaining}
                                  </span>
                                );
                              })()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              ₹{item.current_price}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <input
                                type="number"
                                value={
                                  item.updated_price !== null
                                    ? item.updated_price
                                    : item.current_price
                                }
                                onChange={(e) => {
                                  const targetId = item.is_grouped
                                    ? String(item.item || item.item_name)
                                    : (item._id || `${item.bom_name}-${item.item_name}`);
                                  handlePriceUpdate(targetId, Number(e.target.value));
                                }}
                                className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder={item.current_price.toString()}
                                min="0"
                                step="0.01"
                              />
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              {item.updated_price &&
                              item.updated_price !== item.current_price ? (
                                <div className="flex flex-col">
                                  <span
                                    className={`font-semibold ${
                                      item.updated_price > item.current_price
                                        ? "text-red-600"
                                        : "text-green-600"
                                    }`}
                                  >
                                    ₹
                                    {Math.abs(
                                      item.updated_price - item.current_price
                                    ).toFixed(2)}
                                  </span>
                                  <span
                                    className={`text-xs ${
                                      item.updated_price > item.current_price
                                        ? "text-red-500"
                                        : "text-green-500"
                                    }`}
                                  >
                                    {(
                                      ((item.updated_price -
                                        item.current_price) /
                                        item.current_price) *
                                      100
                                    ).toFixed(1)}
                                    %
                                  </span>
                                </div>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {new Date(item.updated_at).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Submit Button */}
                  <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-6">
                    <button
                      onClick={() => setShowInventoryShortagesModal(false)}
                      className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded-lg font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={submitRawMaterialChanges}
                      disabled={isSavingChanges}
                      className={`px-6 py-2 rounded-lg font-medium ${
                        isSavingChanges
                          ? "bg-gray-400 cursor-not-allowed text-white"
                          : "bg-green-600 hover:bg-green-700 text-white"
                      }`}
                    >
                      {isSavingChanges ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Update Inventory Modal */}
      {showUpdateInventoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">
                Update Inventory - Purchase Form
              </h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={fetchUpdateInventoryForm}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                  disabled={isLoadingUpdateForm}
                >
                  <MdOutlineRefresh
                    className={`text-base ${
                      isLoadingUpdateForm ? "animate-spin" : ""
                    }`}
                  />
                  Refresh
                </button>
                <button
                  onClick={async () => {
                    await Promise.all([
                      fetchInventoryShortages(),
                      fetchUpdateInventoryForm(),
                    ]);
                    toast.success("All data synchronized successfully!");
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Sync All
                </button>
                <button
                  onClick={() => setShowUpdateInventoryModal(false)}
                  className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {isLoadingUpdateForm ? (
                <div className="flex justify-center items-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : updateInventoryForm.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <h3 className="mt-2 text-sm font-medium text-gray-900">
                    No inventory shortages found
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    All inventory levels are sufficient.
                  </p>
                  <div className="mt-4">
                    <button
                      onClick={fetchUpdateInventoryForm}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Price Impact Summary */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-blue-900 mb-2">
                      Price Impact Summary
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-blue-700 font-medium">
                          Total Items:
                        </span>
                        <span className="ml-2 text-blue-900">
                          {updateInventoryForm.length}
                        </span>
                      </div>
                      <div>
                        <span className="text-blue-700 font-medium">
                          Price Changes:
                        </span>
                        <span className="ml-2 text-blue-900">
                          {
                            updateInventoryForm.filter(
                              (item) =>
                                item.updatedPrice &&
                                item.updatedPrice !== item.currentPrice
                            ).length
                          }
                        </span>
                      </div>
                      <div>
                        <span className="text-blue-700 font-medium">
                          Total Impact:
                        </span>
                        <span
                          className={`ml-2 font-semibold ${
                            updateInventoryForm.reduce((total, item) => {
                              const change = item.priceChange || 0;
                              return total + change * item.shortageQuantity;
                            }, 0) > 0
                              ? "text-red-600"
                              : "text-green-600"
                          }`}
                        >
                          ₹
                          {updateInventoryForm
                            .reduce((total, item) => {
                              const change = item.priceChange || 0;
                              return total + change * item.shortageQuantity;
                            }, 0)
                            .toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-blue-700 font-medium">
                          Total Buy Value:
                        </span>
                        <span className="ml-2 font-semibold text-blue-900">
                          ₹
                          {updateInventoryForm
                            .reduce((total, item) => {
                              return (
                                total + item.buyQuantity * item.updatedPrice
                              );
                            }, 0)
                            .toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-blue-900 mb-2">
                      Instructions
                    </h3>
                    <p className="text-blue-800 text-sm">
                      Update prices, fill in Buy Quantity and Price Difference
                      for items with shortages. This form will help you plan
                      your inventory purchases.
                    </p>
                    <p className="text-blue-700 text-xs mt-2">
                      💡 <strong>Tip:</strong> Update prices, fill in Buy
                      Quantity and Price Difference for items with shortages.
                      <strong>Important:</strong> Buy Quantity must be equal to
                      or greater than the Shortage Quantity to submit
                      successfully. Input fields will show red if insufficient,
                      green if sufficient. This form will help you plan your
                      inventory purchases.
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Item Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Shortage Quantity
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Current Stock
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Current Price
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Updated Price
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Price Change
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Buy Quantity
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Price Difference
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {updateInventoryForm.map((item, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {item.itemName}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-semibold">
                              {item.shortageQuantity}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {item.currentStock}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              ₹{item.currentPrice}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <input
                                type="number"
                                value={item.updatedPrice}
                                onChange={(e) =>
                                  handleUpdateInventoryPriceChange(
                                    index,
                                    Number(e.target.value)
                                  )
                                }
                                className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder={item.currentPrice.toString()}
                                min="0"
                                step="0.01"
                              />
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              {item.updatedPrice &&
                              item.updatedPrice !== item.currentPrice ? (
                                <div className="flex flex-col">
                                  <span
                                    className={`font-semibold ${
                                      item.updatedPrice > item.currentPrice
                                        ? "text-red-600"
                                        : "text-green-600"
                                    }`}
                                  >
                                    ₹{Math.abs(item.priceChange).toFixed(2)}
                                  </span>
                                  <span
                                    className={`text-xs ${
                                      item.updatedPrice > item.currentPrice
                                        ? "text-red-500"
                                        : "text-green-500"
                                    }`}
                                  >
                                    {item.priceChangePercentage.toFixed(1)}%
                                  </span>
                                </div>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <input
                                type="number"
                                value={item.buyQuantity}
                                onChange={(e) =>
                                  handleFormInputChange(
                                    index,
                                    "buyQuantity",
                                    Number(e.target.value)
                                  )
                                }
                                className={`w-24 px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                                  item.buyQuantity > 0 &&
                                  item.buyQuantity < item.shortageQuantity
                                    ? "border-red-500 bg-red-50"
                                    : item.buyQuantity >= item.shortageQuantity
                                    ? "border-green-500 bg-green-50"
                                    : "border-gray-300"
                                }`}
                                placeholder="0"
                                min="0"
                              />
                              {item.buyQuantity > 0 && (
                                <div
                                  className={`text-xs mt-1 ${
                                    item.buyQuantity < item.shortageQuantity
                                      ? "text-red-600"
                                      : "text-green-600"
                                  }`}
                                >
                                  {item.buyQuantity < item.shortageQuantity
                                    ? `Need ${
                                        item.shortageQuantity - item.buyQuantity
                                      } more`
                                    : `Sufficient quantity`}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <input
                                type="number"
                                value={item.priceDifference}
                                onChange={(e) =>
                                  handleFormInputChange(
                                    index,
                                    "priceDifference",
                                    Number(e.target.value)
                                  )
                                }
                                className="w-24 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="0.00"
                                min="0"
                                step="0.01"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                    <button
                      onClick={() => setShowUpdateInventoryModal(false)}
                      className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded-lg font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={submitUpdateInventoryForm}
                      className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium"
                    >
                      Submit Purchase Plan
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Raw Material Modal */}
      {/* This modal is no longer needed as the Edit button is removed */}
    </div>
  );
};

export default PurchaseOrder;
