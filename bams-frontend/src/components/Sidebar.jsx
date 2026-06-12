import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Logout } from "./Logout";
import { Landmark, } from "lucide-react";
import { NavLinks } from "../utils/constants";

const Sidebar = ({ picture, name, onClose }) => {
  const pathname = useLocation().pathname;

  return (
    <main className="flex flex-col items-center w-56 px-3 py-4 sticky top-0 h-screen shadow-md bg-blue-50/10">
      <div className="flex items-center justify-center pt-4 gap-2">
        <Landmark width={40} height={40} className="text-blue-800" />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold"> Account MIS </p>
          <span className="text-xs font-medium text-gray-500">
            Control Tower
          </span>
        </div>
      </div>

      <div className="flex flex-col mt-6 gap-1.5 w-full">
        {NavLinks?.map((item) => (
          <Link
            to={item.route}
            key={item.name}
            onClick={onClose}
            className={`${pathname === item.route ? "bg-blue-600/90 text-white" : ""} flex items-center font-medium gap-2 px-4 py-2.5 hover:bg-blue-600/90 hover:text-white transition-all duration-200 rounded-md`}
          >
            {item.icon}
            <span className="text-[13px]">{item.name}</span>
          </Link>
        ))}
      </div>

      <div className="mt-auto w-full flex border-t border-gray-300 pt-3 justify-between items-center">

        <div className="flex items-center gap-2 px-2">
          <img src={picture} alt="Profile" className="w-8 h-8 rounded-full" />
          <span className="text-gray-600 text-sm font-semibold text mr-2">{name}</span>

        </div>

        <Logout
          className="w-full !border !border-transparent hover:!border-gray-500 hover:!cursor-pointer !mr-0.5 !rounded-full !p-3 !text-gray-600 !shadow-none"
          text=""
        />      
        </div>
    </main>
  );
};

export default Sidebar;
