// @ts-nocheck
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  FormControl,
  FormLabel,
  FormErrorMessage,
  Spinner,
} from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useCookies } from "react-cookie";

const AddEmployeeModal = ({ isOpen, onClose, fetchEmployees }) => {
  const [cookies] = useCookies();
  const [loading, setLoading] = useState(false);

  const initialFormState = {
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
  };

  const [form, setForm] = useState(initialFormState);
  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: "" });
  };

  // Validation
  const validate = () => {
    let tempErrors = {};

    if (!form.first_name.trim())
      tempErrors.first_name = "First name is required";

    if (!form.last_name.trim()) tempErrors.last_name = "Last name is required";

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!form.email.trim()) tempErrors.email = "Email is required";
    else if (!emailRegex.test(form.email))
      tempErrors.email = "Enter a valid email";

    const phoneRegex = /^[0-9]{10}$/;
    if (!form.phone.trim()) tempErrors.phone = "Phone number is required";
    else if (!phoneRegex.test(form.phone))
      tempErrors.phone = "Phone must be 10 digits";

    setErrors(tempErrors);

    return Object.keys(tempErrors).length === 0;
  };

  const submitHandler = async () => {
    if (!validate()) return;

    try {
      setLoading(true);

      const response = await fetch(
        process.env.REACT_APP_BACKEND_URL + "/register",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cookies.access_token}`,
          },
          body: JSON.stringify(form),
        }
      );

      const result = await response.json();
      if (!result.success) throw new Error(result.message);

      toast.success("Employee added successfully");
      fetchEmployees();
      onClose();

      setForm(initialFormState);
      setErrors({});
    } catch (error) {
      toast.error(error.message || "Failed to add employee");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
  if (isOpen) {
    setForm(initialFormState);
    setErrors({});
  }
}, [isOpen]);

  return (
    <Modal size="lg" isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent className="rounded-xl">
        <ModalHeader>Add Employee</ModalHeader>
        <ModalCloseButton />

        <ModalBody className="space-y-4">
          <FormControl isInvalid={errors.first_name} isRequired>
            <FormLabel isRequired>First Name</FormLabel>
            <Input
              name="first_name"
              value={form.first_name}
              onChange={handleChange}
              placeholder="John"
            />
            <FormErrorMessage>{errors.first_name}</FormErrorMessage>
          </FormControl>

          <FormControl isInvalid={errors.last_name} isRequired>
            <FormLabel isRequired>Last Name</FormLabel>
            <Input
              name="last_name"
              value={form.last_name}
              onChange={handleChange}
              placeholder="Doe"
            />
            <FormErrorMessage>{errors.last_name}</FormErrorMessage>
          </FormControl>

          <FormControl isInvalid={errors.email} isRequired>
            <FormLabel isRequired>Email</FormLabel>
            <Input
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="john@example.com"
            />
            <FormErrorMessage>{errors.email}</FormErrorMessage>
          </FormControl>

          <FormControl isInvalid={errors.phone} isRequired>
            <FormLabel isRequired>Phone</FormLabel>
            <Input
              name="phone"
              value={form.phone}
              onChange={handleChange}
              placeholder="9876543210"
              maxLength={10}
            />
            <FormErrorMessage>{errors.phone}</FormErrorMessage>
          </FormControl>
        </ModalBody>

        <ModalFooter>
          <Button onClick={onClose} mr={3} variant="ghost">
            Cancel
          </Button>

          <Button
            color="white"
            bg="#2563EB"
            _hover={{ bg: "#1D4ED8" }}
            onClick={submitHandler}
            isDisabled={loading}
          >
            {loading ? <Spinner size="sm" /> : "Save"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default AddEmployeeModal;
